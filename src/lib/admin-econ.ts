import { q, one, tx } from "./db";
import { ACTIONS, actionOf, resetModelPrices } from "./billing";
import { DEFAULT_PRICES, ensurePrices, PRICES, type PriceKey } from "./wallet";
import { audit } from "./admin";
import { addDays, expenseTotals, expensesByDay, listExpenses } from "./expenses";

type Actor = { id: string; email: string };
type R = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const num = (v: unknown) => Number(v ?? 0);

/** Подписи цен для админки: ключ в коде → название и группа. */
export const PRICE_LABELS: Record<PriceKey, [string, string]> = {
  post: ["Пост, сторис, конкурс, опрос", "Материалы"], carousel: ["Карусель", "Материалы"], carousel_slide: ["Один слайд карусели (пересборка)", "Материалы"], article: ["Лонгрид", "Материалы"], seo: ["SEO-статья", "Материалы"],
  reels: ["Сценарий ролика", "Материалы"], infographic: ["Инфографика", "Материалы"], email: ["Рассылка", "Материалы"], guide: ["Гайд / лид-магнит", "Материалы"], script: ["Скрипты (студия)", "Материалы"],
  image: ["Картинка нейросетью", "Картинки"], tts: ["Озвучка", "Картинки"],
  plan_day: ["Контент-план: один день", "План и идеи"], idea: ["Идея (из источника, ещё идеи)", "План и идеи"], strategy: ["Контент-стратегия завода", "План и идеи"],
  edit: ["Правка текста ИИ (одна команда)", "Помощники"], digest: ["Чат-ответ, сводка трендов, разборы", "Помощники"], reply: ["Черновик ответа на комментарий", "Помощники"], variants: ["Версии и A/B-варианты", "Помощники"],
  flowClassify: ["Автолента: разбор новости", "Автолента"], flowJudge: ["Автолента: оценка", "Автолента"], flowRewrite: ["Автолента: переписать пост", "Автолента"],
  kbDigest: ["База знаний: разбор документа", "База знаний"], kbMerge: ["База знаний: сведение", "База знаний"], kbStyle: ["База знаний: стиль", "База знаний"], kbTest: ["База знаний: проверка", "База знаний"],
};

/* ───────── цены списания ───────── */
export async function savePrices(actor: Actor, values: Record<string, number>): Promise<R> {
  const changes: Record<string, [number, number]> = {};
  await tx(async (run) => {
    for (const [key, kop] of Object.entries(values)) {
      if (!(key in DEFAULT_PRICES)) continue;
      if (!Number.isInteger(kop) || kop < 0 || kop > 10_000_000) throw new Error(`Цена «${PRICE_LABELS[key as PriceKey]?.[0] ?? key}» вне допустимых пределов`);
      const cur = PRICES[key as PriceKey];
      if (kop === cur) continue;
      changes[key] = [cur, kop];
      if (kop === DEFAULT_PRICES[key as PriceKey]) await run("delete from kz_price_overrides where key=$1", [key]);
      else await run("insert into kz_price_overrides(key,kop,updated_by) values($1,$2,$3) on conflict(key) do update set kop=excluded.kop,updated_at=now(),updated_by=excluded.updated_by", [key, kop, actor.email]);
    }
  }).catch((e: Error) => { throw e; });
  if (!Object.keys(changes).length) return { ok: true, message: "Изменений нет" };
  await audit(actor, "prices.update", "prices", "all", { changes });
  await ensurePrices(true);
  return { ok: true, message: `Цены обновлены (${Object.keys(changes).length}): новые значения действуют сразу везде` };
}

export async function resetPrices(actor: Actor): Promise<R> {
  await q("delete from kz_price_overrides");
  await audit(actor, "prices.reset", "prices", "all");
  await ensurePrices(true);
  return { ok: true, message: "Все цены возвращены к значениям по умолчанию" };
}

/* ───────── себестоимость моделей ───────── */
export async function saveModelPrice(actor: Actor, m: { model: string; inM: number; outM: number; image: number; call: number; note?: string }): Promise<R> {
  const model = m.model.trim().slice(0, 120);
  if (!model) return { ok: false, error: "Укажите название модели как в шлюзе" };
  for (const v of [m.inM, m.outM, m.image, m.call]) if (!Number.isFinite(v) || v < 0 || v > 1_000_000) return { ok: false, error: "Цены — числа от 0 до 1 000 000 ₽" };
  const k = (rub: number) => Math.round(rub * 10000) / 100; // рубли → копейки с двумя знаками
  await q(`insert into kz_ai_models(model,in_per_m_kop,out_per_m_kop,per_image_kop,per_call_kop,note) values($1,$2,$3,$4,$5,$6)
           on conflict(model) do update set in_per_m_kop=excluded.in_per_m_kop,out_per_m_kop=excluded.out_per_m_kop,per_image_kop=excluded.per_image_kop,per_call_kop=excluded.per_call_kop,note=excluded.note,updated_at=now()`,
    [model, k(m.inM), k(m.outM), k(m.image), k(m.call), (m.note ?? "").slice(0, 200)]);
  resetModelPrices();
  // уже записанные вызовы этой модели пересчитываются по новому прайсу: так видно экономику и за прошлое
  const n = await repriceModel(model);
  await audit(actor, "ai_model.price", "ai_model", model, { inM: m.inM, outM: m.outM, image: m.image, call: m.call });
  return { ok: true, message: `Прайс модели сохранён, пересчитано вызовов: ${n}` };
}

export async function repriceModel(model: string): Promise<number> {
  const r = await q<{ n: string }>(
    `with u as (update kz_ai_usage a set cost_kop = a.tokens_in::numeric/1e6*m.in_per_m_kop + a.tokens_out::numeric/1e6*m.out_per_m_kop + a.images*m.per_image_kop + m.per_call_kop, priced=true
                  from kz_ai_models m where m.model=a.model and a.model=$1 returning 1) select count(*) n from u`, [model]);
  return Number(r[0]?.n ?? 0);
}

export async function deleteModelPrice(actor: Actor, model: string): Promise<R> {
  await q("delete from kz_ai_models where model=$1", [model]);
  resetModelPrices();
  await audit(actor, "ai_model.delete", "ai_model", model);
  return { ok: true, message: "Прайс модели удалён" };
}

export const listModelPrices = async () => {
  const rows = await q<{ model: string; in_per_m_kop: string; out_per_m_kop: string; per_image_kop: string; per_call_kop: string; note: string; calls: string; unpriced: string }>(
    `select m.model,m.in_per_m_kop,m.out_per_m_kop,m.per_image_kop,m.per_call_kop,m.note,
            (select count(*) from kz_ai_usage u where u.model=m.model) calls, 0 unpriced from kz_ai_models m order by m.model`);
  // модели, которые уже вызывались, но прайса у них нет: их надо заполнить, иначе затраты считаются нулевыми
  const missing = await q<{ model: string; calls: string }>("select model,count(*) calls from kz_ai_usage where not priced and model<>'' group by model order by count(*) desc");
  return { priced: rows, missing };
};

/* ───────── безлимит на срок ───────── */
export async function setUnlimitedUntil(actor: Actor, orgId: string, days: number): Promise<R> {
  if (!UUID.test(orgId)) return { ok: false, error: "Организация не найдена" };
  if (!Number.isInteger(days) || days < 0 || days > 365) return { ok: false, error: "Срок — от 1 до 365 дней, 0 — снять безлимит" };
  const r = days === 0
    ? await q<{ id: string }>("update kz_orgs set unlimited_until=null where id=$1 returning id", [orgId])
    : await q<{ id: string }>("update kz_orgs set unlimited_until=greatest(coalesce(unlimited_until, now()), now()) + ($2 || ' days')::interval where id=$1 returning id", [orgId, String(days)]);
  if (!r.length) return { ok: false, error: "Организация не найдена" };
  await audit(actor, days === 0 ? "unlimited.revoke" : "unlimited.grant", "org", orgId, { days });
  const u = await one<{ until: string | null }>("select unlimited_until until from kz_orgs where id=$1", [orgId]);
  return { ok: true, message: days === 0 ? "Безлимит снят" : `Безлимит действует до ${new Date(u!.until!).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` };
}

/* ───────── отчёты ───────── */
export interface Range { from: string | null; to: string | null }
const where = (col: string, r: Range, args: unknown[]) => {
  let s = "";
  if (r.from) { args.push(r.from); s += ` and ${col} >= $${args.length}::timestamptz`; }
  if (r.to) { args.push(r.to); s += ` and ${col} < $${args.length}::timestamptz`; }
  return s;
};

export interface OrgEcon { id: string | null; name: string; owner: string; plan: string; unlimited: boolean; until: string | null; balance: number; charged: number; refunded: number; cost: number; calls: number; tokensIn: number; tokensOut: number; images: number; unpriced: number }

/** Сводка по клиентам: сколько с него списано и сколько нейросети стоили нам. Выручка = списания за вычетом возвратов. */
export async function econByOrg(r: Range): Promise<OrgEcon[]> {
  const a1: unknown[] = [], a2: unknown[] = [];
  const w1 = where("created_at", r, a1), w2 = where("created_at", r, a2);
  const ch = await q<{ org_id: string; charged: string; refunded: string }>(
    `select org_id, coalesce(sum(case when amount_kop<0 then -amount_kop end),0) charged, coalesce(sum(case when amount_kop>0 and reason like 'Возврат:%' then amount_kop end),0) refunded from kz_wallet_tx where reason not like '%администратором%'${w1} group by org_id`, a1);
  const ai = await q<{ org_id: string | null; calls: string; tin: string; tout: string; imgs: string; cost: string; unpriced: string }>(
    `select org_id, count(*) calls, coalesce(sum(tokens_in),0) tin, coalesce(sum(tokens_out),0) tout, coalesce(sum(images),0) imgs, coalesce(sum(cost_kop),0) cost, count(*) filter (where not priced) unpriced from kz_ai_usage where true${w2} group by org_id`, a2);
  const ids = [...new Set([...ch.map((x) => x.org_id), ...ai.map((x) => x.org_id).filter((x): x is string => !!x)])];
  const orgs = ids.length ? await q<{ id: string; name: string; plan: string; unlimited: boolean; balance_kop: string; owner: string | null }>(
    `select o.id,o.name,o.plan,o.unlimited,o.balance_kop,(select u.email from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=o.id and m.role='owner' order by u.created_at limit 1) owner from kz_orgs o where o.id = any($1::uuid[])`, [ids]) : [];
  const until = ids.length ? await q<{ id: string; until: string | null }>("select id, unlimited_until until from kz_orgs where id = any($1::uuid[]) and unlimited_until > now()", [ids]).catch(() => []) : [];
  const rows: OrgEcon[] = orgs.map((o) => {
    const c = ch.find((x) => x.org_id === o.id), a = ai.find((x) => x.org_id === o.id);
    return { id: o.id, name: o.name, owner: o.owner ?? "", plan: o.plan, unlimited: o.unlimited, until: until.find((u) => u.id === o.id)?.until ?? null, balance: num(o.balance_kop),
      charged: num(c?.charged), refunded: num(c?.refunded), cost: num(a?.cost), calls: num(a?.calls), tokensIn: num(a?.tin), tokensOut: num(a?.tout), images: num(a?.imgs), unpriced: num(a?.unpriced) };
  });
  const sys = ai.find((x) => x.org_id === null);
  if (sys) rows.push({ id: null, name: "Система (без клиента: воркер, фоновые задачи)", owner: "", plan: "", unlimited: false, until: null, balance: 0, charged: 0, refunded: 0, cost: num(sys.cost), calls: num(sys.calls), tokensIn: num(sys.tin), tokensOut: num(sys.tout), images: num(sys.imgs), unpriced: num(sys.unpriced) });
  return rows.sort((a, b) => b.cost - a.cost || b.charged - a.charged);
}

export interface ActionEcon { action: string; label: string; ops: number; charged: number; refunded: number; calls: number; cost: number; tokens: number; images: number }

/** По действиям: выручка (списания) и затраты (нейросеть). org — для одного клиента, null — по всей платформе. */
export async function econByAction(r: Range, orgId: string | null): Promise<ActionEcon[]> {
  const a1: unknown[] = [], a2: unknown[] = [];
  let w1 = where("created_at", r, a1), w2 = where("created_at", r, a2);
  if (orgId) { a1.push(orgId); w1 += ` and org_id=$${a1.length}`; a2.push(orgId); w2 += ` and org_id=$${a2.length}`; }
  const tx_ = await q<{ action: string | null; reason: string; charged: string; refunded: string; ops: string }>(
    `select action, case when action is null then left(reason,28) else '' end reason, coalesce(sum(case when amount_kop<0 then -amount_kop end),0) charged, coalesce(sum(case when amount_kop>0 and (reason like 'Возврат:%' or action='refund') then amount_kop end),0) refunded, count(*) filter (where amount_kop<0) ops
       from kz_wallet_tx where reason not like '%администратором%'${w1} group by 1,2`, a1);
  const use = await q<{ action: string; calls: string; cost: string; tokens: string; images: string }>(
    `select action, count(*) calls, coalesce(sum(cost_kop),0) cost, coalesce(sum(tokens_in+tokens_out),0) tokens, coalesce(sum(images),0) images from kz_ai_usage where true${w2} group by action`, a2);
  const map = new Map<string, ActionEcon>();
  const get = (k: string) => { if (!map.has(k)) map.set(k, { action: k, label: ACTIONS[k] ?? k, ops: 0, charged: 0, refunded: 0, calls: 0, cost: 0, tokens: 0, images: 0 }); return map.get(k)!; };
  for (const t of tx_) {
    const k = t.action && t.action !== "refund" ? t.action : t.action === "refund" ? "refund" : actionOf(t.reason);
    // возвраты — отдельная строка: они уменьшают выручку, но не относятся к конкретному действию
    if (k === "refund") { const e = get("refund"); e.refunded += num(t.refunded); continue; }
    const e = get(k);
    e.charged += num(t.charged); e.refunded += num(t.refunded); e.ops += num(t.ops);
  }
  for (const u of use) { const e = get(u.action === "refund" ? "other" : u.action); e.calls += num(u.calls); e.cost += num(u.cost); e.tokens += num(u.tokens); e.images += num(u.images); }
  return [...map.values()].sort((a, b) => b.charged + b.cost - (a.charged + a.cost));
}

export interface ModelEcon { model: string; kind: string; calls: number; tokensIn: number; tokensOut: number; images: number; cost: number; priced: boolean }
export async function econByModel(r: Range, orgId: string | null): Promise<ModelEcon[]> {
  const a: unknown[] = []; let w = where("created_at", r, a);
  if (orgId) { a.push(orgId); w += ` and org_id=$${a.length}`; }
  const rows = await q<{ model: string; kind: string; calls: string; tin: string; tout: string; imgs: string; cost: string; priced: boolean }>(
    `select model,kind,count(*) calls,coalesce(sum(tokens_in),0) tin,coalesce(sum(tokens_out),0) tout,coalesce(sum(images),0) imgs,coalesce(sum(cost_kop),0) cost,bool_and(priced) priced from kz_ai_usage where true${w} group by model,kind order by sum(cost_kop) desc, count(*) desc`, a);
  return rows.map((x) => ({ model: x.model, kind: x.kind, calls: num(x.calls), tokensIn: num(x.tin), tokensOut: num(x.tout), images: num(x.imgs), cost: num(x.cost), priced: x.priced }));
}

export const recentUsage = (orgId: string, limit = 60) => q<{ id: string; at: string; action: string; reason: string; model: string; kind: string; tin: number; tout: number; images: number; cost: string; priced: boolean }>(
  `select id,created_at at,action,reason,model,kind,tokens_in tin,tokens_out tout,images,cost_kop cost,priced from kz_ai_usage where org_id=$1 order by id desc limit $2`, [orgId, limit]);

export async function orgEconInfo(orgId: string) {
  const o = await one<{ id: string; name: string; plan: string; unlimited: boolean; balance_kop: string }>("select id,name,plan,unlimited,balance_kop from kz_orgs where id=$1", [orgId]);
  if (!o) return null;
  const until = await one<{ until: string | null }>("select unlimited_until until from kz_orgs where id=$1", [orgId]).catch(() => null);
  const members = await q<{ user_id: string; email: string; name: string; role: string }>("select u.id user_id,u.email,u.name,m.role from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=$1 order by m.role, u.email", [orgId]);
  return { org: o, until: until?.until ?? null, members };
}

/* ───────── прибыль и потери ───────── */
export interface Pnl { revenue: number; charged: number; refunded: number; aiCost: number; lostFree: number; lostRefunded: number; unpriced: number; expenses: number; expenseBy: Record<string, number>; gross: number; profit: number }

const dayOf = (iso: string | null, fallback: string) => (iso ? new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10) : fallback);
/** Границы периода в календарных днях по Москве: пустые — от первой записи и до сегодня (но не больше 92 дней в таблице по дням). */
export async function periodDays(r: Range): Promise<{ from: string; to: string }> {
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const first = await one<{ d: string | null }>("select to_char(least((select min(created_at) from kz_wallet_tx), (select min(created_at) from kz_ai_usage)) at time zone 'Europe/Moscow','YYYY-MM-DD') d").catch(() => null);
  return { from: dayOf(r.from, first?.d ?? today), to: r.to ? addDays(dayOf(r.to, today), -1) : today };
}

/** Заработали и потеряли за период: выручка − затраты на нейросети − прочие расходы. «Потери»: затраты на ИИ, которые не принесли денег. */
export async function econPnl(r: Range): Promise<Pnl> {
  const a1: unknown[] = [], a2: unknown[] = [];
  const w1 = where("created_at", r, a1), w2 = where("created_at", r, a2);
  const [ch] = await q<{ charged: string; refunded: string }>(`select coalesce(sum(case when amount_kop<0 then -amount_kop end),0) charged, coalesce(sum(case when amount_kop>0 and reason like 'Возврат:%' then amount_kop end),0) refunded from kz_wallet_tx where reason not like '%администратором%'${w1}`, a1);
  const [ai] = await q<{ cost: string; free: string; refunded: string; unpriced: string }>(
    `select coalesce(sum(cost_kop),0) cost, coalesce(sum(cost_kop) filter (where no_revenue='free'),0) free, coalesce(sum(cost_kop) filter (where no_revenue='refunded'),0) refunded, count(*) filter (where not priced) unpriced from kz_ai_usage where true${w2}`, a2)
    .catch(async () => q<{ cost: string; free: string; refunded: string; unpriced: string }>(`select coalesce(sum(cost_kop),0) cost, 0 free, 0 refunded, count(*) filter (where not priced) unpriced from kz_ai_usage where true${w2}`, a2));
  const { from, to } = await periodDays(r);
  const ex = expenseTotals(await listExpenses(), from, to);
  const charged = num(ch?.charged), refunded = num(ch?.refunded), aiCost = num(ai?.cost);
  const revenue = charged - refunded, gross = revenue - aiCost;
  return { revenue, charged, refunded, aiCost, lostFree: num(ai?.free), lostRefunded: num(ai?.refunded), unpriced: num(ai?.unpriced), expenses: ex.total, expenseBy: ex.byCategory, gross, profit: gross - ex.total };
}

export interface DayRow { day: string; revenue: number; aiCost: number; expenses: number; profit: number }

/** По дням: выручка, затраты на нейросети, прочие расходы и прибыль (дни по Москве, не больше 92 последних дней периода). */
export async function econByDay(r: Range): Promise<{ rows: DayRow[]; cut: boolean }> {
  const { from, to } = await periodDays(r);
  const lim = addDays(to, -91);
  const start = from < lim ? lim : from;
  const b = { from: new Date(`${start}T00:00:00+03:00`).toISOString(), to: new Date(Date.parse(`${to}T00:00:00+03:00`) + 86_400_000).toISOString() };
  const [rev, ai] = await Promise.all([
    q<{ d: string; v: string }>(`select to_char(created_at at time zone 'Europe/Moscow','YYYY-MM-DD') d, coalesce(sum(case when amount_kop<0 then -amount_kop when reason like 'Возврат:%' then -amount_kop end),0) v from kz_wallet_tx where reason not like '%администратором%' and created_at >= $1 and created_at < $2 group by 1`, [b.from, b.to]),
    q<{ d: string; v: string }>(`select to_char(created_at at time zone 'Europe/Moscow','YYYY-MM-DD') d, coalesce(sum(cost_kop),0) v from kz_ai_usage where created_at >= $1 and created_at < $2 group by 1`, [b.from, b.to]),
  ]);
  const ex = expensesByDay(await listExpenses(), start, to);
  const rows: DayRow[] = [];
  for (let d = to; d >= start; d = addDays(d, -1)) {
    const revenue = num(rev.find((x) => x.d === d)?.v), aiCost = num(ai.find((x) => x.d === d)?.v), expenses = ex.get(d) ?? 0;
    rows.push({ day: d, revenue, aiCost, expenses, profit: revenue - aiCost - expenses });
  }
  return { rows, cut: from < lim };
}
