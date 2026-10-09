import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { one, q, tx } from "./db";
import type { PlanKey } from "./plans";
import { isSchemaError } from "./errors";
import { LEGAL_VERSION } from "./legal";
import { cleanupAttempts, loginBlocked, loginFailed, loginSucceeded, registerBlocked, registerNoted } from "./throttle";

const COOKIE = "lt_session";
// настоящий хеш случайного пароля: на нём «тратим» то же время bcrypt, когда пользователя с таким email нет
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= bcrypt.hash(randomBytes(16).toString("hex"), 11));
const key = () => {
  const s = process.env.AUTH_SECRET;
  // Без секрета в проде любой смог бы подделать сессию — лучше упасть, чем работать молча с известным ключом.
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET не задан");
  return new TextEncoder().encode(s || "dev-only-secret-change-me");
};

export interface Session { uid: string; org: string; v?: number }
export interface Ctx {
  user: { id: string; email: string; name: string; hasPassword: boolean; refCode: string | null };
  org: { id: string; name: string; plan: PlanKey; balance_kop: number; role: string; unlimited: boolean; suspended: boolean };
  orgs: { id: string; name: string }[];
  isAdmin: boolean;
}

/** Cookie сессии. Отдельно от setSession — route handler ставит её прямо на ответ-редирект. */
export async function sessionCookie(s: Session) {
  // версия сессии пользователя: после смены пароля старые cookie перестают действовать
  const ver = (await one<{ v: number }>("select session_ver v from kz_users where id=$1", [s.uid]).catch((e) => { if (isSchemaError(e)) return null; throw e; }))?.v ?? 0;
  const value = await new SignJWT({ uid: s.uid, org: s.org, v: ver }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("90d").sign(key());
  return { name: COOKIE, value, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 };
}

export async function setSession(s: Session) { (await cookies()).set(await sessionCookie(s)); }

export async function readSession(): Promise<Session | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try { return (await jwtVerify(t, key())).payload as unknown as Session; } catch { return null; }
}

export async function register(email: string, password: string, name: string, orgName: string, refCode?: string, ip = "", consent = false) {
  email = email.trim().toLowerCase();
  if (!consent) return { error: "Чтобы зарегистрироваться, примите условия соглашения и политику конфиденциальности" };
  if (await registerBlocked(ip)) return { error: "Слишком много регистраций с вашего адреса. Попробуйте позже" };
  if (password.length < 8) return { error: "Пароль — минимум 8 символов" };
  if (await one("select 1 from kz_users where email=$1", [email])) return { error: "Этот email уже зарегистрирован" };
  const hash = await bcrypt.hash(password, 11);
  const s = await tx((run) => createAccount(run, email, name, hash, orgName, { refCode, consent: true }));
  await registerNoted(ip);
  await setSession(s);
  return {};
}

/** Пользователь + его организация + стартовый бонус. Общая для регистрации по паролю и через Яндекс/VK. */
export async function createAccount(run: typeof q, email: string, name: string, passwordHash: string, orgName: string, opts: { refCode?: string; hasPassword?: boolean; consent?: boolean } = {}): Promise<Session> {
  const ref = opts.refCode && /^[a-z0-9]{6,12}$/.test(opts.refCode) ? (await run<{ id: string }>("select id from kz_users where ref_code=$1", [opts.refCode]))[0] : undefined;
  const [u] = await run<{ id: string }>("insert into kz_users(email,name,password_hash,has_password,ref_code,referred_by,consent_at,consent_version) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [email, name.trim(), passwordHash, opts.hasPassword ?? true, newRefCode(), ref?.id ?? null, opts.consent ? new Date() : null, opts.consent ? LEGAL_VERSION : null]);
  if (ref) await run("insert into kz_referral_events(referrer_id,referred_id,kind) values($1,$2,'signup') on conflict do nothing", [ref.id, u.id]);
  const [o] = await run<{ id: string }>("insert into kz_orgs(name,balance_kop) values($1,10000) returning id", [orgName.trim() || "Моя организация"]);
  await run("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [o.id, u.id]);
  await run("insert into kz_wallet_tx(org_id,amount_kop,reason) values($1,10000,'Бонус при регистрации')", [o.id]);
  return { uid: u.id, org: o.id };
}

/** Короткий код приглашения: строчные латинские буквы и цифры без похожих (0/o, 1/l). */
export function newRefCode(): string {
  const al = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(8), (b) => al[b % al.length]).join("");
}

/** Адрес для возврата после входа — только свой путь, иначе была бы открытая переадресация на чужой сайт. */
export function safeNext(n: unknown): string {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") && s.length < 300 ? s : "/app";
}

/** Организация по умолчанию для входа: сначала где пользователь владелец. */
export async function defaultOrg(userId: string): Promise<string | null> {
  const m = await one<{ org_id: string }>("select org_id from kz_memberships where user_id=$1 order by case role when 'owner' then 0 else 1 end, org_id limit 1", [userId]);
  return m?.org_id ?? null;
}

export async function login(email: string, password: string, ip = "") {
  email = email.trim().toLowerCase();
  if (await loginBlocked(email, ip)) return { error: "Слишком много неудачных попыток входа. Подождите 15 минут" };
  const u = await one<{ id: string; password_hash: string; has_password: boolean; disabled: boolean }>("select id,password_hash,has_password,disabled from kz_users where email=$1", [email]);
  // одинаковый ответ на «нет пользователя» и «неверный пароль» — не раскрываем, какие email зарегистрированы.
  // Сравнение делаем всегда (даже без пользователя), иначе время ответа выдаёт, есть ли такой email.
  const ok = await bcrypt.compare(password, u?.password_hash ?? (await dummyHash()));
  if (!u || !u.has_password || !ok) { await loginFailed(email, ip); return { error: "Неверный email или пароль" }; }
  if (u.disabled) return { error: "Аккаунт заблокирован. Обратитесь к администратору платформы" };
  await loginSucceeded(email);
  if (Math.random() < 0.02) cleanupAttempts().catch(() => {});
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
  try { return await loadCtx(); }
  catch (e) { if (isSchemaError(e)) redirect("/update-required"); throw e; }
}

async function loadCtx(): Promise<Ctx> {
  const s = await readSession();
  if (!s) redirect("/login");
  // Безлимит — у организации, чей ВЛАДЕЛЕЦ в списке админов платформы. Приглашённый админ в чужой организации
  // её бесплатной не делает. Пересчитываем при каждом входе: убрали email из списка — безлимит снимется.
  const admins = (process.env.PLATFORM_ADMIN_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  await q(`update kz_orgs o set unlimited = exists(select 1 from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=o.id and m.role='owner' and lower(u.email)=any($2::text[]))
            where o.id=$1 and o.unlimited is distinct from exists(select 1 from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=o.id and m.role='owner' and lower(u.email)=any($2::text[]))`, [s.org, admins]);
  const row = await one<{ email: string; name: string; org_name: string; plan: PlanKey; balance_kop: string; role: string; unlimited: boolean; session_ver: number; has_password: boolean; ref_code: string | null; disabled: boolean; suspended: boolean }>(
    `select u.email,u.name,u.session_ver,u.has_password,u.ref_code,u.disabled,o.suspended,o.name org_name,o.plan,o.balance_kop,o.unlimited,m.role
       from kz_memberships m join kz_users u on u.id=m.user_id join kz_orgs o on o.id=m.org_id
      where m.user_id=$1 and m.org_id=$2`, [s.uid, s.org]);
  if (!row || row.disabled || (s.v ?? 0) !== row.session_ver) redirect("/login");
  const orgs = await q<{ id: string; name: string }>("select o.id,o.name from kz_memberships m join kz_orgs o on o.id=m.org_id where m.user_id=$1 order by o.name", [s.uid]);
  const isAdmin = admins.includes(row.email.toLowerCase());
  // приостановленная организация недоступна её участникам; администратор платформы заходит всегда
  if (row.suspended && !isAdmin) redirect("/suspended");
  return {
    user: { id: s.uid, email: row.email, name: row.name, hasPassword: row.has_password, refCode: row.ref_code },
    org: { id: s.org, name: row.org_name, plan: row.plan, balance_kop: Number(row.balance_kop), role: row.role, unlimited: row.unlimited, suspended: row.suspended },
    orgs,
    isAdmin,
  };
}

export function canWrite(role: string) { return role !== "viewer"; }

export async function requireWriter(): Promise<Ctx> {
  const c = await requireCtx();
  if (!canWrite(c.org.role)) throw new Error("Недостаточно прав");
  return c;
}
