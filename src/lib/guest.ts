import { createHash, randomBytes, randomUUID } from "node:crypto";
import { one, q, tx } from "./db";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export interface GuestLink { id: string; label: string; expires_at: string | null; created_at: string; last_used_at: string | null }

export const EXPIRY: Record<string, { label: string; days: number | null }> = {
  "7": { label: "7 дней", days: 7 }, "30": { label: "30 дней", days: 30 }, "90": { label: "90 дней", days: 90 }, never: { label: "Без срока", days: null },
};

export async function listGuestLinks(orgId: string): Promise<GuestLink[]> {
  return q<GuestLink>("select id,label,expires_at,created_at,last_used_at from kz_guest_links where org_id=$1 order by created_at desc", [orgId]).catch(() => []);
}

/** Создаёт служебного пользователя-наблюдателя и ссылку. Сама ссылка возвращается один раз: в базе остаётся только хэш. */
export async function createGuestLink(orgId: string, actorId: string, label: string, expiry: string, origin: string): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const days = (EXPIRY[expiry] ?? EXPIRY["30"]).days;
  const count = await one<{ n: string }>("select count(*) n from kz_guest_links where org_id=$1", [orgId]);
  if (Number(count?.n ?? 0) >= 20) return { ok: false, error: "Не больше 20 гостевых ссылок: удалите ненужные" };
  const token = randomBytes(32).toString("base64url");
  await tx(async (run) => {
    const [u] = await run<{ id: string }>("insert into kz_users(email,name,password_hash,has_password) values($1,$2,$3,false) returning id",
      [`guest-${randomUUID()}@guest.invalid`, label.trim().slice(0, 60) || "Гость", `!${randomBytes(16).toString("hex")}`]);
    await run("insert into kz_memberships(org_id,user_id,role) values($1,$2,'viewer')", [orgId, u.id]);
    await run("insert into kz_guest_links(org_id,user_id,label,token_hash,expires_at,created_by) values($1,$2,$3,$4,$5,$6)",
      [orgId, u.id, label.trim().slice(0, 60), hash(token), days ? new Date(Date.now() + days * 86400_000).toISOString() : null, actorId]);
  });
  return { ok: true, link: `${origin}/g/${token}` };
}

export async function revokeGuestLink(orgId: string, id: string): Promise<void> {
  // удаляем служебного пользователя: вместе с ним уходят членство и ссылка, открытые сессии перестают действовать
  const l = await one<{ user_id: string }>("select user_id from kz_guest_links where id=$1 and org_id=$2", [id, orgId]);
  if (l) await q("delete from kz_users where id=$1", [l.user_id]);
}

/** По ссылке из письма: служебный пользователь и организация, если ссылка действует. */
export async function guestByToken(token: string): Promise<{ userId: string; orgId: string } | null> {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const r = await one<{ user_id: string; org_id: string }>(
    "select user_id,org_id from kz_guest_links where token_hash=$1 and (expires_at is null or expires_at > now())", [hash(token)]).catch(() => null);
  if (!r) return null;
  await q("update kz_guest_links set last_used_at=now() where token_hash=$1", [hash(token)]).catch(() => {});
  return { userId: r.user_id, orgId: r.org_id };
}
