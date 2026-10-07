import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { one, q, tx } from "./db";
import type { PlanKey } from "./plans";

const COOKIE = "lt_session";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-only-secret-change-me");

export interface Session { uid: string; org: string }
export interface Ctx {
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; plan: PlanKey; balance_kop: number; role: string };
  orgs: { id: string; name: string }[];
}

async function setSession(s: Session) {
  const token = await new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30d").sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function readSession(): Promise<Session | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try { return (await jwtVerify(t, key())).payload as unknown as Session; } catch { return null; }
}

export async function register(email: string, password: string, name: string, orgName: string) {
  email = email.trim().toLowerCase();
  if (password.length < 8) return { error: "Пароль — минимум 8 символов" };
  if (await one("select 1 from users where email=$1", [email])) return { error: "Этот email уже зарегистрирован" };
  const hash = await bcrypt.hash(password, 11);
  const s = await tx(async (run) => {
    const [u] = await run<{ id: string }>("insert into users(email,name,password_hash) values($1,$2,$3) returning id", [email, name.trim(), hash]);
    const [o] = await run<{ id: string }>("insert into orgs(name,balance_kop) values($1,10000) returning id", [orgName.trim() || "Моя организация"]);
    await run("insert into memberships(org_id,user_id,role) values($1,$2,'owner')", [o.id, u.id]);
    await run("insert into wallet_tx(org_id,amount_kop,reason) values($1,10000,'Бонус при регистрации')", [o.id]);
    return { uid: u.id, org: o.id };
  });
  await setSession(s);
  return {};
}

export async function login(email: string, password: string) {
  const u = await one<{ id: string; password_hash: string }>("select id,password_hash from users where email=$1", [email.trim().toLowerCase()]);
  // одинаковый ответ на «нет пользователя» и «неверный пароль» — не раскрываем, какие email зарегистрированы
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return { error: "Неверный email или пароль" };
  const m = await one<{ org_id: string }>("select org_id from memberships where user_id=$1 order by role limit 1", [u.id]);
  if (!m) return { error: "У пользователя нет организации" };
  await setSession({ uid: u.id, org: m.org_id });
  return {};
}

export async function logout() { (await cookies()).delete(COOKIE); }

export async function switchOrg(orgId: string) {
  const s = await readSession();
  if (!s) return;
  if (await one("select 1 from memberships where org_id=$1 and user_id=$2", [orgId, s.uid])) await setSession({ uid: s.uid, org: orgId });
}

/** Контекст запроса. Единственная точка, откуда берётся org_id — все запросы данных обязаны брать его отсюда. */
export async function requireCtx(): Promise<Ctx> {
  const s = await readSession();
  if (!s) redirect("/login");
  const row = await one<{ email: string; name: string; org_name: string; plan: PlanKey; balance_kop: string; role: string }>(
    `select u.email,u.name,o.name org_name,o.plan,o.balance_kop,m.role
       from memberships m join users u on u.id=m.user_id join orgs o on o.id=m.org_id
      where m.user_id=$1 and m.org_id=$2`, [s.uid, s.org]);
  if (!row) redirect("/login");
  const orgs = await q<{ id: string; name: string }>("select o.id,o.name from memberships m join orgs o on o.id=m.org_id where m.user_id=$1 order by o.name", [s.uid]);
  return {
    user: { id: s.uid, email: row.email, name: row.name },
    org: { id: s.org, name: row.org_name, plan: row.plan, balance_kop: Number(row.balance_kop), role: row.role },
    orgs,
  };
}

export function canWrite(role: string) { return role !== "viewer"; }
