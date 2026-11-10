import { one, q, tx } from "./db";
export { tokens } from "./tokens";
import { actionOf, setUsageCtx, usageStore } from "./billing";

export const rub = (kop: number) => `${(kop / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

/** Стоимость операций в сотых долях токена. Администратор может переопределить любую в «Админ → Цены»: тогда действует его значение, везде сразу. */
export const DEFAULT_PRICES = { plan_day: 30, post: 300, carousel_slide: 100, article: 1200, reels: 500, idea: 50, digest: 100, image: 300, carousel: 1200, seo: 2000, script: 500, tts: 100, infographic: 800, strategy: 300, reply: 50, variants: 300, email: 600, guide: 2000, flowClassify: 10, flowJudge: 10, flowRewrite: 50, kbDigest: 100, kbMerge: 300, kbStyle: 200, kbTest: 50, edit: 50 };
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
let colsAt = 0, cols = { action: false, until: false, bonus: false, avatars: false };
export async function billingCols() {
  if (Date.now() - colsAt < 60_000) return cols;
  try {
    const r = await q<{ c: string }>("select table_name||'.'||column_name c from information_schema.columns where (table_name='kz_wallet_tx' and column_name in ('action','bonus_part')) or (table_name='kz_orgs' and column_name='unlimited_until') or (table_name='kz_user_avatars' and column_name='user_id')");
    cols = { action: r.some((x) => x.c === "kz_wallet_tx.action"), until: r.some((x) => x.c === "kz_orgs.unlimited_until"), bonus: r.some((x) => x.c === "kz_wallet_tx.bonus_part"), avatars: r.some((x) => x.c === "kz_user_avatars.user_id") };
  } catch { /* оставляем прежнее */ }
  colsAt = Date.now();
  return cols;
}

export class InsufficientFunds extends Error {}

export interface ChargeReceipt { id: string; units: number; ref?: string; free: boolean }

export async function charge(orgId: string, units: number, reason: string, ref?: string, model?: string | string[]) {
  if (!Number.isSafeInteger(units) || units < 0) throw new Error("Некорректная стоимость операции");
  const context = usageStore();
  const { planCatalog, effectiveTerms } = await import("./plan-catalog");
  setUsageCtx({ orgId, reason, ref, free: false });
  await ensurePrices();
  const catalog = await planCatalog();
  const receipt = await tx(async run => {
    const [o] = await run<{ balance_kop: string; token_value_kop: string; unlimited: boolean; timed: boolean; active: boolean; plan: import("./plans").PlanKey; plan_terms: import("./plan-catalog").PlanTerms | null; plan_until: string | null }>("select plan,plan_terms,plan_until,balance_kop,token_value_kop,unlimited,unlimited_until>now() timed,(plan_until is null or plan_until>now()) active from kz_orgs where id=$1 for update", [orgId]);
    if (!o) throw new InsufficientFunds();
    const terms = effectiveTerms(catalog, o);
    const feature = reason.startsWith("Студия:") || reason.startsWith("Слайд ") ? "studio" : "create";
    if (!context.waive && !o.unlimited && !o.timed && !terms.capabilities?.includes(feature)) throw new Error("Эта функция не входит в ваш тариф. Выберите другой тариф в разделе оплаты.");
    const free = !!(context.waive || o.unlimited || o.timed || (o.active && model && (Array.isArray(model) ? model.length > 0 && model.every(m => !!m && terms.unlimitedModels.includes(m)) : terms.unlimitedModels.includes(model))));
    let bonus = 0, value = 0;
    if (!free) {
      if (Number(o.balance_kop) < units) throw new InsufficientFunds();
      const [pot] = await run<{ pot: string }>("select coalesce(sum(amount_kop) filter(where credit_kind in ('bonus','gift') or reason='Бонус при регистрации'),0)-coalesce(sum(bonus_part),0) pot from kz_wallet_tx where org_id=$1", [orgId]);
      const bonusBalance = Math.max(0, Math.min(Number(o.balance_kop), Number(pot?.pot ?? 0)));
      bonus = Math.min(bonusBalance, units);
      const paidBalance = Number(o.balance_kop) - bonusBalance;
      value = paidBalance > 0 ? Math.min(Number(o.token_value_kop), Math.round(Number(o.token_value_kop) * (units - bonus) / paidBalance)) : 0;
      await run("update kz_orgs set balance_kop=balance_kop-$2,token_value_kop=token_value_kop-$3 where id=$1", [orgId, units, value]);
    }
    const [row] = await run<{ id: string }>("insert into kz_wallet_tx(org_id,amount_kop,reason,ref,action,bonus_part,revenue_kop,nominal_units) values($1,$2,$3,$4,$5,$6,$7,$8) returning id", [orgId, free ? 0 : -units, free ? `Без списания: ${reason}` : reason, ref ?? null, actionOf(reason), bonus, -value, units]);
    return { id: row.id, units, ref, free, bonusShare: units ? bonus / units : 0 };
  });
  context.tokenCharges ??= [];
  context.tokenCharges.push(receipt);
  setUsageCtx({ free: receipt.free, bonusShare: receipt.bonusShare, spent: (context.spent ?? 0) + (receipt.free ? 0 : units) });
  return receipt;
}

/** Refund the original debit, never a guessed amount or the organization's current entitlement. */
export async function refund(orgId: string, units: number, reason: string, ref?: string) {
  if (!Number.isSafeInteger(units) || units <= 0) return;
  const ctx = usageStore();
  const charges = [...(ctx.tokenCharges ?? [])].reverse();
  const local = charges.find(x => x.ref === ref && x.units === units) ?? charges.find(x => x.ref === ref && x.units >= units);
  await tx(async run => {
    await run("select id from kz_orgs where id=$1 for update", [orgId]);
    const [original] = await run<{ id: string; amount_kop: string; nominal_units: string; refunded_units: string; bonus_part: string; revenue_kop: string }>(
      `select id,amount_kop,nominal_units,refunded_units,bonus_part,revenue_kop from kz_wallet_tx where org_id=$1 and nominal_units>refunded_units and ${local ? "id=$2" : "ref is not distinct from $2"} order by created_at desc limit 1 for update`, [orgId, local?.id ?? ref ?? null]);
    if (!original) return;
    const nominal = Number(original.nominal_units), already = Number(original.refunded_units);
    const take = Math.min(units, nominal - already);
    await run("update kz_wallet_tx set refunded_units=refunded_units+$2 where id=$1", [original.id, take]);
    if (Number(original.amount_kop) === 0) return;
    const portion = (total: number) => Math.round(total * (already + take) / nominal) - Math.round(total * already / nominal);
    const bonus = portion(Number(original.bonus_part)), value = portion(-Number(original.revenue_kop));
    await run("update kz_orgs set balance_kop=balance_kop+$2,token_value_kop=token_value_kop+$3 where id=$1", [orgId, take, value]);
    await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref,action,bonus_part,revenue_kop,refund_of) values($1,$2,$3,$4,'refund',$5,$6,$7)", [orgId, take, `Возврат: ${reason}`, ref ?? null, -bonus, value, original.id]);
  });
  setUsageCtx({ spent: Math.max(0, (ctx.spent ?? 0) - units) });
  if (ref) await q("update kz_ai_usage set no_revenue='refunded' where org_id=$1 and ref=$2 and no_revenue is null and created_at>now()-interval '45 minutes'", [orgId, ref]).catch(() => null);
}
