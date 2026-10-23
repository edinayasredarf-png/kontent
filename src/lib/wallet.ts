import { q, tx } from "./db";
import { actionOf, setUsageCtx } from "./billing";

export const rub = (kop: number) => `${(kop / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

/** Цены операций в копейках по умолчанию. Администратор может переопределить любую в «Админ → Цены»: тогда действует его значение, везде сразу. */
export const DEFAULT_PRICES = { plan_day: 300, post: 2000, carousel_slide: 700, article: 4000, reels: 2000, idea: 300, digest: 600, image: 1500, carousel: 3500, seo: 6000, script: 3000, tts: 500, infographic: 3000, strategy: 1000, reply: 300, variants: 2000, email: 3000, guide: 6000, flowClassify: 50, flowJudge: 30, flowRewrite: 200, kbDigest: 500, kbMerge: 1500, kbStyle: 1000, kbTest: 200, edit: 300 };
export type PriceKey = keyof typeof DEFAULT_PRICES;
/** Действующие цены. Объект меняется на месте при загрузке переопределений, поэтому все, кто читает PRICES.xxx, видят актуальное значение. */
export const PRICES: Record<PriceKey, number> = { ...DEFAULT_PRICES };

let loadedAt = 0, loading: Promise<void> | null = null;
/** Подтягивает цены администратора из базы (не чаще раза в 10 секунд). Без таблицы или при сбое остаются цены по умолчанию. */
export async function ensurePrices(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < 10_000) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const rows = await q<{ key: string; kop: number }>("select key,kop from kz_price_overrides");
      Object.assign(PRICES, DEFAULT_PRICES);
      for (const r of rows) if (r.key in DEFAULT_PRICES) PRICES[r.key as PriceKey] = r.kop;
    } catch { /* таблицы ещё нет */ }
    loadedAt = Date.now();
  })().finally(() => { loading = null; });
  return loading;
}

/** Умеет ли база новые поля учёта (после миграции 027); проверка раз в минуту, чтобы старая схема не ломала списания. */
let colsAt = 0, cols = { action: false, until: false };
async function billingCols() {
  if (Date.now() - colsAt < 60_000) return cols;
  try {
    const r = await q<{ c: string }>("select table_name||'.'||column_name c from information_schema.columns where (table_name='kz_wallet_tx' and column_name='action') or (table_name='kz_orgs' and column_name='unlimited_until')");
    cols = { action: r.some((x) => x.c === "kz_wallet_tx.action"), until: r.some((x) => x.c === "kz_orgs.unlimited_until") };
  } catch { /* оставляем прежнее */ }
  colsAt = Date.now();
  return cols;
}

export class InsufficientFunds extends Error {}

export async function charge(orgId: string, kop: number, reason: string, ref?: string) {
  // дальнейшие вызовы нейросети в этом запросе учитываются на эту организацию и это действие; ставится до первого await, чтобы контекст дошёл до вызывающего
  setUsageCtx({ orgId, reason, ref, free: false });
  await ensurePrices();
  const c = await billingCols();
  let free = false;
  await tx(async (run) => {
    const [o] = await run<{ balance_kop: string; unlimited: boolean; timed: boolean }>(
      `select balance_kop,unlimited,${c.until ? "(unlimited_until is not null and unlimited_until > now())" : "false"} timed from kz_orgs where id=$1 for update`, [orgId]);
    if (o?.unlimited || o?.timed) { free = true; return; } // админ платформы или пробный безлимит: генерация бесплатна, баланс не трогаем
    if (!o || Number(o.balance_kop) < kop) throw new InsufficientFunds();
    await run("update kz_orgs set balance_kop=balance_kop-$2 where id=$1", [orgId, kop]);
    if (c.action) await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref,action) values($1,$2,$3,$4,$5)", [orgId, -kop, reason, ref ?? null, actionOf(reason)]);
    else await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref) values($1,$2,$3,$4)", [orgId, -kop, reason, ref ?? null]);
  });
  // вызовы нейросети после бесплатного списания отмечаются как «без выручки»
  setUsageCtx({ free });
}

export async function refund(orgId: string, kop: number, reason: string, ref?: string) {
  const c = await billingCols();
  await tx(async (run) => {
    // не начисляем возврат за списание, которого не было
    const [o] = await run<{ unlimited: boolean; timed: boolean }>(`select unlimited,${c.until ? "(unlimited_until is not null and unlimited_until > now())" : "false"} timed from kz_orgs where id=$1`, [orgId]);
    if (o?.unlimited || o?.timed) return;
    await run("update kz_orgs set balance_kop=balance_kop+$2 where id=$1", [orgId, kop]);
    if (c.action) await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref,action) values($1,$2,$3,$4,'refund')", [orgId, kop, `Возврат: ${reason}`, ref ?? null]);
    else await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref) values($1,$2,$3,$4)", [orgId, kop, `Возврат: ${reason}`, ref ?? null]);
  });
  // нейросеть для этой операции мы уже оплатили, а деньги вернули клиенту: затраты помечаются как потеря
  if (ref) await q("update kz_ai_usage set no_revenue='refunded' where org_id=$1 and ref=$2 and no_revenue is null and created_at > now() - interval '45 minutes'", [orgId, ref]).catch(() => null);
}
