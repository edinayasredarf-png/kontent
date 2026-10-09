import { redirect } from "next/navigation";
import { requireCtx, type Ctx } from "./auth";
import { one, q, tx } from "./db";
import { PLANS, type PlanKey } from "./plans";

/** Все админские действия начинаются отсюда: доступ только у email из PLATFORM_ADMIN_EMAILS, проверка на сервере при каждом вызове. */
export async function requireAdmin(): Promise<Ctx> {
  const c = await requireCtx();
  if (!c.isAdmin) redirect("/app");
  return c;
}

export async function audit(actor: { id: string; email: string }, action: string, targetType: string, targetId: string, details: Record<string, unknown> = {}) {
  await q("insert into kz_audit(actor_id,actor_email,action,target_type,target_id,details) values($1,$2,$3,$4,$5,$6)", [actor.id, actor.email, action, targetType, targetId, JSON.stringify(details)]);
}

/** Шаблоны для поиска без учёта регистра. ILIKE для кириллицы зависит от локали базы (в «C» не срабатывает), поэтому перебираем варианты регистра сами. */
function patterns(search: string): string[] {
  const s = search.trim().replace(/[%_\\]/g, "\\$&");
  if (!s) return ["%%"];
  const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return [...new Set([s, s.toLowerCase(), s.toUpperCase(), cap])].map((x) => `%${x}%`);
}

type R = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
export const MAX_ADJUST_KOP = 100_000_000; // 1 000 000 ₽ за одну операцию

export async function overview() {
  const r = await one<Record<string, string>>(
    `select (select count(*) from kz_users) users, (select count(*) from kz_users where created_at > now() - interval '7 days') users_7d,
            (select count(*) from kz_orgs) orgs, (select count(*) from kz_orgs where suspended) suspended,
            (select count(*) from kz_content_items where created_at > now() - interval '7 days') items_7d,
            (select count(*) from kz_publications where status='published' and published_at > now() - interval '7 days') pubs_7d,
            (select count(*) from kz_publications where status='failed' and updated_at > now() - interval '7 days') failed_7d,
            (select coalesce(sum(-amount_kop),0) from kz_wallet_tx where amount_kop<0 and created_at > now() - interval '7 days') spent_7d,
            (select coalesce(sum(balance_kop),0) from kz_orgs) balances,
            (select count(*) from kz_users where disabled) disabled`);
  const tick = await one<{ value: Record<string, unknown>; updated_at: string }>("select value,updated_at from kz_kv where key='last_tick'");
  return { stats: r!, tick };
}

export async function listOrgs(search: string, page: number, limit = 30) {
  const like = patterns(search);
  const rows = await q<{ id: string; name: string; plan: PlanKey; balance_kop: string; unlimited: boolean; suspended: boolean; created_at: string; owner: string | null; brands: string; factories: string; members: string; last: string | null }>(
    `select o.id,o.name,o.plan,o.balance_kop,o.unlimited,o.suspended,o.created_at,
            (select u.email from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=o.id and m.role='owner' limit 1) owner,
            (select count(*) from kz_brands where org_id=o.id) brands, (select count(*) from kz_factories where org_id=o.id) factories,
            (select count(*) from kz_memberships where org_id=o.id) members,
            (select max(created_at) from kz_wallet_tx where org_id=o.id and amount_kop<0) last
       from kz_orgs o where ($1::text[] = array['%%'] or o.name ilike any($1::text[]) or exists (select 1 from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=o.id and u.email ilike any($1::text[])))
      order by o.created_at desc limit $2 offset $3`, [like, limit + 1, (page - 1) * limit]);
  return { rows: rows.slice(0, limit), more: rows.length > limit };
}

export async function orgDetail(id: string) {
  if (!UUID.test(id)) return null;
  const org = await one<{ id: string; name: string; plan: PlanKey; balance_kop: string; unlimited: boolean; suspended: boolean; created_at: string }>("select id,name,plan,balance_kop,unlimited,suspended,created_at from kz_orgs where id=$1", [id]);
  if (!org) return null;
  const [members, factories, tx_, usage] = await Promise.all([
    q<{ user_id: string; email: string; name: string; role: string; disabled: boolean; created_at: string }>("select m.user_id,u.email,u.name,m.role,u.disabled,u.created_at from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=$1 order by m.role,u.email", [id]),
    q<{ id: string; name: string; status: string; brand: string; items: string }>("select f.id,f.name,f.status,b.name brand,(select count(*) from kz_content_items i where i.factory_id=f.id) items from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 order by f.created_at", [id]),
    q<{ id: string; amount_kop: string; reason: string; created_at: string }>("select id,amount_kop,reason,created_at from kz_wallet_tx where org_id=$1 order by created_at desc limit 40", [id]),
    one<{ brands: string; sources: string; assets: string; items: string }>("select (select count(*) from kz_brands where org_id=$1) brands,(select count(*) from kz_sources where org_id=$1) sources,(select coalesce(sum(size),0) from kz_assets where org_id=$1) assets,(select count(*) from kz_content_items where org_id=$1) items", [id]),
  ]);
  return { org, members, factories, tx: tx_, usage: usage! };
}

/** Ручное пополнение или списание. Баланс меняется под блокировкой строки, отрицательным не становится, запись попадает и в журнал баланса, и в аудит. */
export async function adjustBalance(actor: { id: string; email: string }, orgId: string, rub: number, reason: string): Promise<R> {
  if (!UUID.test(orgId)) return { ok: false, error: "Организация не найдена" };
  const kop = Math.round(rub * 100);
  if (!Number.isFinite(rub) || kop === 0) return { ok: false, error: "Укажите сумму, не равную нулю" };
  if (Math.abs(kop) > MAX_ADJUST_KOP) return { ok: false, error: "Не больше 1 000 000 ₽ за одну операцию" };
  const why = reason.replace(/\s+/g, " ").trim();
  if (why.length < 3) return { ok: false, error: "Укажите причину (минимум 3 символа) — она попадёт в журнал" };
  return tx(async (run) => {
    const [o] = await run<{ balance_kop: string }>("select balance_kop from kz_orgs where id=$1 for update", [orgId]);
    if (!o) return { ok: false as const, error: "Организация не найдена" };
    if (Number(o.balance_kop) + kop < 0) return { ok: false as const, error: "Баланс не может стать отрицательным" };
    await run("update kz_orgs set balance_kop=balance_kop+$2 where id=$1", [orgId, kop]);
    await run("insert into kz_wallet_tx(org_id,amount_kop,reason) values($1,$2,$3)", [orgId, kop, `${kop > 0 ? "Пополнение" : "Списание"} администратором: ${why.slice(0, 200)}`]);
    await run("insert into kz_audit(actor_id,actor_email,action,target_type,target_id,details) values($1,$2,'balance.adjust','org',$3,$4)", [actor.id, actor.email, orgId, JSON.stringify({ kop, reason: why })]);
    return { ok: true as const, message: `Баланс ${kop > 0 ? "пополнен" : "уменьшен"} на ${(Math.abs(kop) / 100).toLocaleString("ru-RU")} ₽` };
  });
}

export async function setOrgPlan(actor: { id: string; email: string }, orgId: string, plan: string): Promise<R> {
  if (!UUID.test(orgId) || !(plan in PLANS)) return { ok: false, error: "Неверный тариф" };
  const r = await q<{ plan: string }>("update kz_orgs o set plan=$2 from (select plan from kz_orgs where id=$1) old where o.id=$1 returning old.plan", [orgId, plan]);
  if (!r.length) return { ok: false, error: "Организация не найдена" };
  await audit(actor, "org.plan", "org", orgId, { from: r[0].plan, to: plan });
  return { ok: true, message: `Тариф: ${PLANS[plan as PlanKey].name}` };
}

export async function setOrgSuspended(actor: { id: string; email: string }, orgId: string, suspended: boolean): Promise<R> {
  if (!UUID.test(orgId)) return { ok: false, error: "Организация не найдена" };
  const r = await q("update kz_orgs set suspended=$2 where id=$1 returning id", [orgId, suspended]);
  if (!r.length) return { ok: false, error: "Организация не найдена" };
  await audit(actor, suspended ? "org.suspend" : "org.resume", "org", orgId);
  return { ok: true, message: suspended ? "Организация приостановлена: участники не войдут, воркер её не обрабатывает" : "Организация снова активна" };
}

/** Блокировка пользователя: сразу же обнуляет его сессии (session_ver). Себя заблокировать нельзя — не останется администратора. */
export async function setUserDisabled(actor: { id: string; email: string }, userId: string, disabled: boolean): Promise<R> {
  if (!UUID.test(userId)) return { ok: false, error: "Пользователь не найден" };
  if (userId === actor.id) return { ok: false, error: "Нельзя заблокировать самого себя" };
  const r = await q("update kz_users set disabled=$2, session_ver=session_ver+1 where id=$1 returning id", [userId, disabled]);
  if (!r.length) return { ok: false, error: "Пользователь не найден" };
  await audit(actor, disabled ? "user.disable" : "user.enable", "user", userId);
  return { ok: true, message: disabled ? "Пользователь заблокирован, его сессии закрыты" : "Пользователь разблокирован" };
}

export async function forceLogout(actor: { id: string; email: string }, userId: string): Promise<R> {
  if (!UUID.test(userId)) return { ok: false, error: "Пользователь не найден" };
  const r = await q("update kz_users set session_ver=session_ver+1 where id=$1 returning id", [userId]);
  if (!r.length) return { ok: false, error: "Пользователь не найден" };
  await audit(actor, "user.logout_all", "user", userId);
  return { ok: true, message: "Все сессии пользователя закрыты" };
}

export async function listUsers(search: string, page: number, limit = 30) {
  const like = patterns(search);
  const rows = await q<{ id: string; email: string; name: string; disabled: boolean; created_at: string; has_password: boolean; orgs: string; consent_at: string | null }>(
    `select u.id,u.email,u.name,u.disabled,u.created_at,u.has_password,u.consent_at,(select count(*) from kz_memberships where user_id=u.id) orgs
       from kz_users u where ($1::text[] = array['%%'] or u.email ilike any($1::text[]) or u.name ilike any($1::text[])) order by u.created_at desc limit $2 offset $3`, [like, limit + 1, (page - 1) * limit]);
  return { rows: rows.slice(0, limit), more: rows.length > limit };
}

export const listAudit = (limit = 100) => q<{ id: string; actor_email: string; action: string; target_type: string; target_id: string; details: Record<string, unknown>; at: string }>(
  "select id,actor_email,action,target_type,target_id,details,at from kz_audit order by at desc, id desc limit $1", [limit]);
