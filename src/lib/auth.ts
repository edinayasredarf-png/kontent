import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { one, q, tx } from "./db";
import type { PlanKey } from "./plans";

const COOKIE = "lt_session";
const key = () => {
  const s = process.env.AUTH_SECRET;
  // Без секрета в проде любой смог бы подделать сессию — лучше упасть, чем работать молча с известным ключом.
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET не задан");
  return new TextEncoder().encode(s || "dev-only-secret-change-me");
};

export interface Session { uid: string; org: string }
export interface Ctx {
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; plan: PlanKey; balance_kop: number; role: string; unlimited: boolean };
  orgs: { id: string; name: string }[];
  isAdmin: boolean;
}

/** Cookie сессии. Отдельно от setSession — route handler ставит её прямо на ответ-редирект. */
export async function sessionCookie(s: Session) {
  const value = await new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("90d").sign(key());
  return { name: COOKIE, value, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 };
}

export async function setSession(s: Session) { (await cookies()).set(await sessionCookie(s)); }

export async function readSession(): Promise<Session | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try { return (await jwtVerify(t, key())).payload as unknown as Session; } catch { return null; }
}

export async function register(email: string, password: string, name: string, orgName: string) {
  email = email.trim().toLowerCase();
  if (password.length < 8) return { error: "Пароль — минимум 8 символов" };
  if (await one("select 1 from kz_users where email=$1", [email])) return { error: "Этот email уже зарегистрирован" };
  const hash = await bcrypt.hash(password, 11);
  const s = await tx((run) => createAccount(run, email, name, hash, orgName));
  await setSession(s);
  return {};
}

/** Пользователь + его организация + стартовый бонус. Общая для регистрации по паролю и через Яндекс/VK. */
export async function createAccount(run: typeof q, email: string, name: string, passwordHash: string, orgName: string): Promise<Session> {
  const [u] = await run<{ id: string }>("insert into kz_users(email,name,password_hash) values($1,$2,$3) returning id", [email, name.trim(), passwordHash]);
  const [o] = await run<{ id: string }>("insert into kz_orgs(name,balance_kop) values($1,10000) returning id", [orgName.trim() || "Моя организация"]);
  await run("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [o.id, u.id]);
  await run("insert into kz_wallet_tx(org_id,amount_kop,reason) values($1,10000,'Бонус при регистрации')", [o.id]);
  return { uid: u.id, org: o.id };
}

/** Организация по умолчанию для входа: сначала где пользователь владелец. */
export async function defaultOrg(userId: string): Promise<string | null> {
  const m = await one<{ org_id: string }>("select org_id from kz_memberships where user_id=$1 order by case role when 'owner' then 0 else 1 end, org_id limit 1", [userId]);
  return m?.org_id ?? null;
}

export async function login(email: string, password: string) {
  const u = await one<{ id: string; password_hash: string }>("select id,password_hash from kz_users where email=$1", [email.trim().toLowerCase()]);
  // одинаковый ответ на «нет пользователя» и «неверный пароль» — не раскрываем, какие email зарегистрированы
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return { error: "Неверный email или пароль" };
  const org = await defaultOrg(u.id);
  if (!org) return { error: "У пользователя нет организации" };
  await setSession({ uid: u.id, org });
  return {};
}

export async function logout() { (await cookies()).delete(COOKIE); }

export async function switchOrg(orgId: string) {
  const s = await readSession();
  if (!s) return;
  if (await one("select 1 from kz_memberships where org_id=$1 and user_id=$2", [orgId, s.uid])) await setSession({ uid: s.uid, org: orgId });
}

/** Контекст запроса. Единственная точка, откуда берётся org_id — все запросы данных обязаны брать его отсюда. */
export async function requireCtx(): Promise<Ctx> {
  const s = await readSession();
  if (!s) redirect("/login");
  // Безлимит — у организации, чей ВЛАДЕЛЕЦ в списке админов платформы. Приглашённый админ в чужой организации
  // её бесплатной не делает. Пересчитываем при каждом входе: убрали email из списка — безлимит снимется.
  const admins = (process.env.PLATFORM_ADMIN_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  await q(`update kz_orgs o set unlimited = exists(select 1 from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=o.id and m.role='owner' and lower(u.email)=any($2::text[]))
            where o.id=$1 and o.unlimited is distinct from exists(select 1 from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=o.id and m.role='owner' and lower(u.email)=any($2::text[]))`, [s.org, admins]);
  const row = await one<{ email: string; name: string; org_name: string; plan: PlanKey; balance_kop: string; role: string; unlimited: boolean }>(
    `select u.email,u.name,o.name org_name,o.plan,o.balance_kop,o.unlimited,m.role
       from kz_memberships m join kz_users u on u.id=m.user_id join kz_orgs o on o.id=m.org_id
      where m.user_id=$1 and m.org_id=$2`, [s.uid, s.org]);
  if (!row) redirect("/login");
  const orgs = await q<{ id: string; name: string }>("select o.id,o.name from kz_memberships m join kz_orgs o on o.id=m.org_id where m.user_id=$1 order by o.name", [s.uid]);
  return {
    user: { id: s.uid, email: row.email, name: row.name },
    org: { id: s.org, name: row.org_name, plan: row.plan, balance_kop: Number(row.balance_kop), role: row.role, unlimited: row.unlimited },
    orgs,
    isAdmin: admins.includes(row.email.toLowerCase()),
  };
}

export function canWrite(role: string) { return role !== "viewer"; }
