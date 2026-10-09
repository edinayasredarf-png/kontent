import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { one, q, tx } from "./db";
import { mailConfigured, mailLayout, sendMail } from "./mail";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const REAL_EMAIL = (e: string) => !e.endsWith("@oauth.invalid");
export const RESET_TTL_MIN = 60;

/** Создаёт одноразовый токен (в БД только хеш), прежние неиспользованные токены пользователя отзываются. */
export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await tx(async (run) => {
    await run("delete from kz_password_resets where user_id=$1 and used_at is null", [userId]);
    await run("insert into kz_password_resets(user_id,token_hash,expires_at) values($1,$2,now() + ($3||' minutes')::interval)", [userId, hash(token), String(RESET_TTL_MIN)]);
  });
  return token;
}

/**
 * Запрос сброса. Ответ всегда одинаковый, существует email или нет, — иначе форма превратилась бы в проверку «есть ли этот человек у нас».
 * Лимиты: 3 запроса в час на email и 10 на IP; счётчик растёт и для несуществующих адресов.
 */
export async function requestReset(rawEmail: string, ip: string, origin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mailConfigured()) return { ok: false, error: "Отправка писем на сервере не настроена. Обратитесь к администратору — он может выдать ссылку для сброса" };
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: "Введите корректный email" };
  const c = await one<{ e: string; i: string }>(
    `select count(*) filter (where email=$1) e, count(*) filter (where ip=$2 and $2<>'') i from kz_auth_attempts where kind='reset' and at > now() - interval '1 hour'`, [email, ip]);
  if (Number(c!.e) >= 3 || Number(c!.i) >= 10) return { ok: false, error: "Слишком много запросов. Попробуйте через час" };
  await q("insert into kz_auth_attempts(kind,email,ip) values('reset',$1,$2)", [email, ip]);
  const u = await one<{ id: string; disabled: boolean }>("select id,disabled from kz_users where email=$1", [email]);
  if (u && !u.disabled && REAL_EMAIL(email)) {
    try {
      const token = await createResetToken(u.id);
      const url = `${origin}/reset/${token}`;
      const m = mailLayout("Сброс пароля", `Вы (или кто-то другой) запросили сброс пароля в «Контент-заводе».\nСсылка действует ${RESET_TTL_MIN} минут и работает один раз.\nЕсли это были не вы — просто проигнорируйте письмо, пароль останется прежним.`, { label: "Задать новый пароль", url });
      await sendMail({ to: email, subject: "Сброс пароля — Контент-завод", ...m });
    } catch (e) { console.error("[reset] не удалось отправить письмо:", (e as Error).message); }
  }
  return { ok: true };
}

export async function resetInfo(token: string): Promise<{ email: string } | null> {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  return one<{ email: string }>(
    `select u.email from kz_password_resets r join kz_users u on u.id=r.user_id where r.token_hash=$1 and r.used_at is null and r.expires_at > now() and not u.disabled`, [hash(token)]);
}

/** Смена пароля по токену. Все прежние сессии аннулируются (session_ver), оставшиеся токены пользователя удаляются. */
export async function performReset(token: string, password: string, confirm: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password.length < 8) return { ok: false, error: "Пароль — минимум 8 символов" };
  if (password.length > 200) return { ok: false, error: "Пароль слишком длинный" };
  if (password !== confirm) return { ok: false, error: "Пароли не совпадают" };
  const pwHash = await bcrypt.hash(password, 11);
  return tx(async (run) => {
    const [r] = await run<{ id: string; user_id: string }>(
      `select r.id,r.user_id from kz_password_resets r join kz_users u on u.id=r.user_id where r.token_hash=$1 and r.used_at is null and r.expires_at > now() and not u.disabled for update of r`, [hash(token)]);
    if (!r) return { ok: false as const, error: "Ссылка недействительна или устарела. Запросите сброс заново" };
    await run("update kz_users set password_hash=$2, has_password=true, session_ver=session_ver+1 where id=$1", [r.user_id, pwHash]);
    await run("update kz_password_resets set used_at=now() where id=$1", [r.id]);
    await run("delete from kz_password_resets where user_id=$1 and used_at is null", [r.user_id]);
    await run("delete from kz_auth_attempts where kind='login' and email=(select email from kz_users where id=$1)", [r.user_id]); // сбросили пароль — старые неудачи не должны блокировать вход
    return { ok: true as const };
  });
}
