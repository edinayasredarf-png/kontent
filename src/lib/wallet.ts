import { one, q, tx } from "./db";
import { notify } from "./notify";
import { actionOf, setUsageCtx, usageStore } from "./billing";

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
let colsAt = 0, cols = { action: false, until: false, bonus: false };
export async function billingCols() {
  if (Date.now() - colsAt < 60_000) return cols;
  try {
    const r = await q<{ c: string }>("select table_name||'.'||column_name c from information_schema.columns where (table_name='kz_wallet_tx' and column_name in ('action','bonus_part')) or (table_name='kz_orgs' and column_name='unlimited_until')");
    cols = { action: r.some((x) => x.c === "kz_wallet_tx.action"), until: r.some((x) => x.c === "kz_orgs.unlimited_until"), bonus: r.some((x) => x.c === "kz_wallet_tx.bonus_part") };
  } catch { /* оставляем прежнее */ }
  colsAt = Date.now();
  return cols;
}

export class InsufficientFunds extends Error {}

export async function charge(orgId: string, kop: number, reason: string, ref?: string) {
  // дальнейшие вызовы нейросети в этом запросе учитываются на эту организацию и это действие; ставится до первого await, чтобы контекст дошёл до вызывающего
  // обучение нового клиента бесплатно: деньги не списываем, а расход на нейросеть записываем как «без выручки»
  if (usageStore().waive) { setUsageCtx({ orgId, reason: `Обучение: ${reason}`, ref, free: true, bonusShare: 0 }); return; }
  setUsageCtx({ orgId, reason, ref, free: false });
  await ensurePrices();
  const c = await billingCols();
  let free = false, bonusTaken = 0;
  await tx(async (run) => {
    const [o] = await run<{ balance_kop: string; unlimited: boolean; timed: boolean }>(
      `select balance_kop,unlimited,${c.until ? "(unlimited_until is not null and unlimited_until > now())" : "false"} timed from kz_orgs where id=$1 for update`, [orgId]);
    if (o?.unlimited || o?.timed) { free = true; return; } // админ платформы или пробный безлимит: генерация бесплатна, баланс не трогаем
    if (!o || Number(o.balance_kop) < kop) throw new InsufficientFunds();
    await run("update kz_orgs set balance_kop=balance_kop-$2 where id=$1", [orgId, kop]);
    // подарочные деньги (бонус при регистрации, подарки администратора) тратятся первыми и выручкой не считаются
    let take = 0;
    if (c.bonus) {
      const [p] = await run<{ pot: string }>(`select coalesce(sum(amount_kop) filter (where credit_kind in ('bonus','gift') or reason='Бонус при регистрации'),0) - coalesce(sum(bonus_part),0) pot from kz_wallet_tx where org_id=$1`, [orgId]);
      take = Math.min(Math.max(0, Number(p?.pot ?? 0)), kop);
    }
    bonusTaken = take;
    if (c.bonus) await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref,action,bonus_part) values($1,$2,$3,$4,$5,$6)", [orgId, -kop, reason, ref ?? null, actionOf(reason), take]);
    else if (c.action) await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref,action) values($1,$2,$3,$4,$5)", [orgId, -kop, reason, ref ?? null, actionOf(reason)]);
    else await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref) values($1,$2,$3,$4)", [orgId, -kop, reason, ref ?? null]);
  });
  // вызовы нейросети после бесплатного списания отмечаются как «без выручки»
  setUsageCtx({ free, bonusShare: kop > 0 ? bonusTaken / kop : 0, spent: (usageStore().spent ?? 0) + kop });
  if (!free) {
    const left = Number((await one<{ b: string }>("select balance_kop b from kz_orgs where id=$1", [orgId]).catch(() => null))?.b ?? 1e9);
    if (left < 5000) void notify(orgId, { kind: "low_balance", title: left < 500 ? "Баланс почти закончился" : "Баланс ниже 50 ₽", body: "Пополните баланс, чтобы материалы продолжили создаваться и выходить по расписанию", href: "/app/billing", dedupe: `bal:${new Date().toISOString().slice(0, 10)}`, to: "managers" });
  }
}

export async function refund(orgId: string, kop: number, reason: string, ref?: string) {
  if (usageStore().waive) return; // списания не было, возвращать нечего
  setUsageCtx({ spent: Math.max(0, (usageStore().spent ?? 0) - kop) });
  const c = await billingCols();
  await tx(async (run) => {
    // не начисляем возврат за списание, которого не было
    const [o] = await run<{ unlimited: boolean; timed: boolean }>(`select unlimited,${c.until ? "(unlimited_until is not null and unlimited_until > now())" : "false"} timed from kz_orgs where id=$1`, [orgId]);
    if (o?.unlimited || o?.timed) return;
    await run("update kz_orgs set balance_kop=balance_kop+$2 where id=$1", [orgId, kop]);
    // если исходное списание частично шло из подарочных денег, возврат возвращает эту долю обратно в подарочный остаток
    let part = 0;
    if (c.bonus && ref) {
      const [orig] = await run<{ bonus_part: string; amount_kop: string }>("select bonus_part,amount_kop from kz_wallet_tx where org_id=$1 and ref=$2 and amount_kop<0 order by created_at desc limit 1", [orgId, ref]);
      if (orig && Number(orig.bonus_part) > 0) part = Math.min(Number(orig.bonus_part), Math.round((Number(orig.bonus_part) * kop) / -Number(orig.amount_kop)));
    }
    if (c.bonus) await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref,action,bonus_part) values($1,$2,$3,$4,'refund',$5)", [orgId, kop, `Возврат: ${reason}`, ref ?? null, -part]);
    else if (c.action) await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref,action) values($1,$2,$3,$4,'refund')", [orgId, kop, `Возврат: ${reason}`, ref ?? null]);
    else await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref) values($1,$2,$3,$4)", [orgId, kop, `Возврат: ${reason}`, ref ?? null]);
  });
  // нейросеть для этой операции мы уже оплатили, а деньги вернули клиенту: затраты помечаются как потеря
  if (ref) await q("update kz_ai_usage set no_revenue='refunded' where org_id=$1 and ref=$2 and no_revenue is null and created_at > now() - interval '45 minutes'", [orgId, ref]).catch(() => null);
}
