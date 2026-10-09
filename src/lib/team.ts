import { createHash, randomBytes } from "node:crypto";
import { one, q, tx } from "./db";
import { PLANS, type PlanKey } from "./plans";

export const ROLE_LABEL: Record<string, string> = { owner: "Владелец", admin: "Администратор", editor: "Редактор", viewer: "Наблюдатель" };
export const ROLE_HINT: Record<string, string> = {
  admin: "Всё, включая приглашение людей", editor: "Создаёт и редактирует материалы, публикует", viewer: "Только просмотр",
};
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
type R = { ok: true; link?: string } | { ok: false; error: string };

export const canManageTeam = (role: string) => role === "owner" || role === "admin";

export async function listTeam(orgId: string) {
  const members = await q<{ user_id: string; email: string; name: string; role: string }>(
    `select m.user_id,u.email,u.name,m.role from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=$1 order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.email`, [orgId]);
  const invites = await q<{ id: string; email: string | null; role: string; expires_at: string }>(
    "select id,email,role,expires_at from kz_invites where org_id=$1 and accepted_at is null and expires_at > now() order by created_at desc", [orgId]);
  return { members, invites };
}

async function seatsUsed(orgId: string): Promise<number> {
  const r = await one<{ n: string }>(
    `select (select count(*) from kz_memberships where org_id=$1) + (select count(*) from kz_invites where org_id=$1 and accepted_at is null and expires_at > now()) n`, [orgId]);
  return Number(r!.n);
}

export async function createInvite(o: { orgId: string; plan: PlanKey; unlimited: boolean; actorId: string; actorRole: string; email: string; role: string; origin: string }): Promise<R> {
  if (!canManageTeam(o.actorRole)) return { ok: false, error: "Приглашать могут владелец и администратор" };
  if (!["admin", "editor", "viewer"].includes(o.role)) return { ok: false, error: "Неверная роль" };
  if (o.role === "admin" && o.actorRole !== "owner") return { ok: false, error: "Администратора может назначить только владелец" };
  const email = o.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Некорректный email" };
  const lim = o.unlimited ? null : PLANS[o.plan].members;
  if (lim !== null && (await seatsUsed(o.orgId)) >= lim) return { ok: false, error: `Тариф «${PLANS[o.plan].name}»: максимум участников — ${lim} (вместе с ожидающими приглашениями)` };
  if (email && (await one("select 1 from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=$1 and u.email=$2", [o.orgId, email]))) return { ok: false, error: "Этот человек уже в команде" };
  const token = randomBytes(24).toString("base64url");
  await q("insert into kz_invites(org_id,email,role,token_hash,invited_by,expires_at) values($1,$2,$3,$4,$5,now() + interval '7 days')", [o.orgId, email || null, o.role, hash(token), o.actorId]);
  return { ok: true, link: `${o.origin}/invite/${token}` };
}

export async function inviteInfo(token: string) {
  return one<{ id: string; org_id: string; org_name: string; email: string | null; role: string }>(
    `select i.id,i.org_id,o.name org_name,i.email,i.role from kz_invites i join kz_orgs o on o.id=i.org_id where i.token_hash=$1 and i.accepted_at is null and i.expires_at > now()`, [hash(token)]);
}

/** Принятие: ссылка одноразовая; если приглашение выписано на email — принять может только его владелец. */
export async function acceptInvite(token: string, user: { id: string; email: string }): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  return tx(async (run) => {
    const [inv] = await run<{ id: string; org_id: string; email: string | null; role: string }>(
      "select id,org_id,email,role from kz_invites where token_hash=$1 and accepted_at is null and expires_at > now() for update", [hash(token)]);
    if (!inv) return { ok: false as const, error: "Приглашение недействительно или истекло" };
    if (inv.email && inv.email.toLowerCase() !== user.email.toLowerCase()) return { ok: false as const, error: `Приглашение выписано на ${inv.email}. Войдите под этой почтой` };
    await run("insert into kz_memberships(org_id,user_id,role) values($1,$2,$3) on conflict (org_id,user_id) do nothing", [inv.org_id, user.id, inv.role]);
    await run("update kz_invites set accepted_at=now() where id=$1", [inv.id]);
    return { ok: true as const, orgId: inv.org_id };
  });
}

export async function revokeInvite(orgId: string, actorRole: string, id: string): Promise<R> {
  if (!canManageTeam(actorRole)) return { ok: false, error: "Недостаточно прав" };
  await q("delete from kz_invites where id=$1 and org_id=$2 and accepted_at is null", [id, orgId]);
  return { ok: true };
}

export async function setRole(orgId: string, actorId: string, actorRole: string, userId: string, role: string): Promise<R> {
  if (!canManageTeam(actorRole)) return { ok: false, error: "Недостаточно прав" };
  if (!["admin", "editor", "viewer"].includes(role)) return { ok: false, error: "Неверная роль" };
  if (role === "admin" && actorRole !== "owner") return { ok: false, error: "Администратора может назначить только владелец" };
  const t = await one<{ role: string }>("select role from kz_memberships where org_id=$1 and user_id=$2", [orgId, userId]);
  if (!t) return { ok: false, error: "Участник не найден" };
  if (t.role === "owner") return { ok: false, error: "Роль владельца изменить нельзя" };
  if (t.role === "admin" && actorRole !== "owner") return { ok: false, error: "Администратора может изменить только владелец" };
  await q("update kz_memberships set role=$3 where org_id=$1 and user_id=$2", [orgId, userId, role]);
  return { ok: true };
}

export async function removeMember(orgId: string, actorId: string, actorRole: string, userId: string): Promise<R> {
  const self = actorId === userId;
  if (!self && !canManageTeam(actorRole)) return { ok: false, error: "Недостаточно прав" };
  const t = await one<{ role: string }>("select role from kz_memberships where org_id=$1 and user_id=$2", [orgId, userId]);
  if (!t) return { ok: false, error: "Участник не найден" };
  if (t.role === "owner") return { ok: false, error: "Владельца удалить нельзя" };
  if (!self && t.role === "admin" && actorRole !== "owner") return { ok: false, error: "Администратора может удалить только владелец" };
  await q("delete from kz_memberships where org_id=$1 and user_id=$2", [orgId, userId]);
  return { ok: true };
}
