import { one, q } from "./db";
import { isSchemaError } from "./errors";

/** Если таблицы счётчиков ещё нет (миграция не применена) — вход не блокируем, иначе из-за забытой миграции никто не войдёт. */
async function soft<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try { return await run(); } catch (e) { if (isSchemaError(e)) { console.warn("[throttle] таблица kz_auth_attempts не найдена — примените миграцию 009"); return fallback; } throw e; }
}

/**
 * Защита от перебора паролей и массовых регистраций. Счётчики в БД, а не в памяти: функции Vercel живут недолго и их много.
 * Вход: не больше 8 неудач на email и 30 на IP за 15 минут. Регистрация: не больше 10 с одного IP в час.
 */
export const LIMITS = { loginEmail: 8, loginIp: 30, registerIp: 10 };

export const loginBlocked = (email: string, ip: string) => soft(() => loginBlockedRaw(email, ip), false);
async function loginBlockedRaw(email: string, ip: string): Promise<boolean> {
  const r = await one<{ e: string; i: string }>(
    `select count(*) filter (where email=$1) e, count(*) filter (where ip=$2 and $2<>'') i from kz_auth_attempts where kind='login' and at > now() - interval '15 minutes'`, [email, ip]);
  return Number(r!.e) >= LIMITS.loginEmail || Number(r!.i) >= LIMITS.loginIp;
}
export const loginFailed = (email: string, ip: string) => soft(() => q("insert into kz_auth_attempts(kind,email,ip) values('login',$1,$2)", [email, ip]), []);
export const loginSucceeded = (email: string) => soft(() => q("delete from kz_auth_attempts where kind='login' and email=$1", [email]), []);

export const registerBlocked = (ip: string) => soft(() => registerBlockedRaw(ip), false);
async function registerBlockedRaw(ip: string): Promise<boolean> {
  if (!ip) return false;
  const r = await one<{ n: string }>("select count(*) n from kz_auth_attempts where kind='register' and ip=$1 and at > now() - interval '1 hour'", [ip]);
  return Number(r!.n) >= LIMITS.registerIp;
}
export const registerNoted = (ip: string) => soft(() => q("insert into kz_auth_attempts(kind,ip) values('register',$1)", [ip]), []);
export const cleanupAttempts = () => soft(() => q("delete from kz_auth_attempts where at < now() - interval '2 days'"), []);
