import { LEGAL_VERSION } from "./legal";
import { randomUUID } from "node:crypto";
import { one, q, tx } from "./db";
import { planCatalog, validatePlan, type PlanTerms } from "./plan-catalog";
import type { PlanKey } from "./plans";
import { tokenUnits } from "./tokens";
import { amountKop, confirmationUrl, yooConfig, yooRequest, type YooPayment } from "./yookassa";
export interface PaymentOrder { id: string; org_id: string; user_id: string; request_key: string; provider_id: string | null; shop_id: string; test_mode: boolean; amount_kop: string; plan_key: PlanKey; terms: PlanTerms; request_body: unknown; status: string; confirmation_url: string | null; credited_at: string | null; created_at: string }
export function verifyPayment(order: Pick<PaymentOrder, "id" | "org_id" | "amount_kop" | "shop_id" | "test_mode" | "provider_id">, payment: YooPayment) {
  if (!payment.id || (order.provider_id && order.provider_id !== payment.id) || payment.metadata?.order_id !== order.id || payment.metadata?.org_id !== order.org_id || payment.recipient?.account_id !== order.shop_id || payment.test !== order.test_mode || payment.amount.currency !== "RUB" || amountKop(payment.amount.value) !== Number(order.amount_kop)) throw new Error("Данные платежа не совпадают с заказом");
}
export async function createCheckout(orgId: string, userId: string, email: string, planKey: string, requestKey: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requestKey)) throw new Error("Обновите страницу тарифов");
  const config = await yooConfig();
  if (!config.enabled) throw new Error("Приём оплаты ещё не включён");
  let order = await one<PaymentOrder>("select * from kz_payment_orders where request_key=$1 and org_id=$2 and user_id=$3", [requestKey, orgId, userId]);
  if (!order) {
    const catalog = await planCatalog();
    if (!Object.hasOwn(catalog, planKey) || planKey === "free") throw new Error("Тариф недоступен");
    const terms = catalog[planKey as PlanKey];
    if (!terms.enabled) throw new Error("Этот тариф больше не продаётся");
    const id = randomUUID(), amount = Math.round(terms.priceRub * 100);
    const body = { amount: { value: (amount / 100).toFixed(2), currency: "RUB" }, capture: true, confirmation: { type: "redirect", return_url: `${config.origin}/app/billing?order=${id}` }, description: `JuicerAI: ${terms.name}, ${terms.durationDays} дней`.slice(0, 128), metadata: { order_id: id, org_id: orgId, legal_version: LEGAL_VERSION }, ...(config.receipt ? { receipt: { customer: { email }, ...(config.taxSystem ? { tax_system_code: config.taxSystem } : {}), items: [{ description: `Доступ JuicerAI «${terms.name}»`.slice(0, 128), quantity: "1.00", amount: { value: (amount / 100).toFixed(2), currency: "RUB" }, vat_code: config.vatCode, payment_mode: "full_payment", payment_subject: "service" }] } } : {}) };
    await q("insert into kz_payment_orders(id,org_id,user_id,request_key,shop_id,test_mode,amount_kop,plan_key,terms,receipt_email,request_body) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb) on conflict(request_key) do nothing", [id, orgId, userId, requestKey, config.shopId, config.testMode, amount, planKey, JSON.stringify(terms), email, JSON.stringify(body)]);
    order = await one<PaymentOrder>("select * from kz_payment_orders where request_key=$1 and org_id=$2 and user_id=$3", [requestKey, orgId, userId]);
  }
  if (!order || order.plan_key !== planKey) throw new Error("Обновите страницу перед выбором другого тарифа");
  if (order.shop_id !== config.shopId || order.test_mode !== config.testMode) throw new Error("Настройки магазина изменились. Создайте новый заказ");
  if (["succeeded", "canceled"].includes(order.status)) return { orderId: order.id, url: `/app/billing?order=${order.id}` };
  if (!order.provider_id && Date.now() - new Date(order.created_at).getTime() > 23 * 3600000) throw new Error("Заказ устарел. Обновите страницу тарифов и создайте новый заказ");
  const payment = order.provider_id ? await yooRequest<YooPayment>(config, `payments/${encodeURIComponent(order.provider_id)}`) : await yooRequest<YooPayment>(config, "payments", order.request_body, order.request_key);
  verifyPayment(order, payment);
  if (payment.status === "succeeded" || payment.status === "canceled") { await applyPayment(payment); return { orderId: order.id, url: `/app/billing?order=${order.id}` }; }
  const url = confirmationUrl(payment.confirmation?.confirmation_url);
  await q("update kz_payment_orders set provider_id=$2,status=$3,confirmation_url=$4,updated_at=now() where id=$1 and credited_at is null and status not in ('succeeded','canceled')", [order.id, payment.id, payment.status, url]);
  return { orderId: order.id, url };
}
/** Called only with a payment re-fetched server-to-server. Never trust the webhook payload. */
export async function applyPayment(payment: YooPayment) {
  const id = payment.metadata?.order_id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Заказ не найден");
  return tx(async run => {
    const [order] = await run<PaymentOrder>("select * from kz_payment_orders where id=$1 for update", [id]);
    if (!order) throw new Error("Заказ не найден");
    verifyPayment(order, payment);
    if (order.credited_at) return;
    if (payment.status !== "succeeded" || !payment.paid) {
      await run("update kz_payment_orders set provider_id=$2,status=$3,updated_at=now() where id=$1 and status<>'succeeded'", [id, payment.id, payment.status]);
      return;
    }
    // Sandbox payments never grant production tokens or paid entitlements.
    if (!payment.test) {
      const terms = validatePlan(order.terms, order.plan_key);
      const units = tokenUnits(terms.tokens);
      const [org] = await run<{ same: boolean }>("select (plan=$2 and plan_terms=$3::jsonb) same from kz_orgs where id=$1 for update", [order.org_id, terms.key, JSON.stringify(terms)]);
      const same = org?.same === true;
      await run(`update kz_orgs set balance_kop=balance_kop+$2,token_value_kop=token_value_kop+$3,plan=$4,plan_terms=$5::jsonb,
        plan_until=(case when $7::boolean then greatest(coalesce(plan_until,now()),now()) else now() end)+make_interval(days=>$6::int) where id=$1`, [order.org_id, units, Number(order.amount_kop), terms.key, JSON.stringify(terms), terms.durationDays, same]);
      await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref,action,credit_kind,revenue_kop) values($1,$2,$3,$4,'purchase','paid',0)", [order.org_id, units, `Покупка тарифа «${terms.name}»`, id]);
    }
    await run("update kz_payment_orders set provider_id=$2,status='succeeded',credited_at=now(),updated_at=now() where id=$1", [id, payment.id]);
  });
}
export async function syncPayment(orderId: string, orgId?: string) {
  const order = await one<PaymentOrder>(`select * from kz_payment_orders where id=$1${orgId ? " and org_id=$2" : ""}`, orgId ? [orderId, orgId] : [orderId]);
  if (!order?.provider_id || order.credited_at) return order;
  const config = await yooConfig();
  if (config.shopId !== order.shop_id) throw new Error("Проверка платежа требует настройки исходного магазина");
  await applyPayment(await yooRequest<YooPayment>(config, `payments/${encodeURIComponent(order.provider_id)}`));
  return one<PaymentOrder>("select * from kz_payment_orders where id=$1", [orderId]);
}
