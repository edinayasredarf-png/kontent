import bcrypt from "bcryptjs";
import { one, q } from "./db";

type R = { ok: true } | { ok: false; error: string };

export async function updateName(userId: string, name: string): Promise<R> {
  const n = name.replace(/\s+/g, " ").trim();
  if (n.length < 2 || n.length > 80) return { ok: false, error: "Имя — от 2 до 80 символов" };
  await q("update kz_users set name=$2 where id=$1", [userId, n]);
  return { ok: true };
}

/** Смена пароля: нужен текущий (кроме аккаунтов, созданных через Яндекс/VK — у них пароля ещё нет). Старые сессии аннулируются. */
export async function changePassword(userId: string, current: string, next: string, confirm: string): Promise<R> {
  if (next.length < 8) return { ok: false, error: "Новый пароль — минимум 8 символов" };
  if (next.length > 200) return { ok: false, error: "Пароль слишком длинный" };
  if (next !== confirm) return { ok: false, error: "Пароли не совпадают" };
  const u = await one<{ password_hash: string; has_password: boolean }>("select password_hash,has_password from kz_users where id=$1", [userId]);
  if (!u) return { ok: false, error: "Пользователь не найден" };
  if (u.has_password && !(await bcrypt.compare(current, u.password_hash))) return { ok: false, error: "Текущий пароль неверный" };
  await q("update kz_users set password_hash=$2, has_password=true, session_ver=session_ver+1 where id=$1", [userId, await bcrypt.hash(next, 11)]);
  return { ok: true };
}

/** Смена email: по паролю. Для аккаунтов без пароля сначала нужно его задать. */
export async function changeEmail(userId: string, email: string, password: string): Promise<R> {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) return { ok: false, error: "Некорректный email" };
  const u = await one<{ password_hash: string; has_password: boolean; email: string }>("select password_hash,has_password,email from kz_users where id=$1", [userId]);
  if (!u) return { ok: false, error: "Пользователь не найден" };
  if (!u.has_password) return { ok: false, error: "Сначала задайте пароль в блоке «Пароль»" };
  if (!(await bcrypt.compare(password, u.password_hash))) return { ok: false, error: "Пароль неверный" };
  if (e === u.email) return { ok: true };
  if (await one("select 1 from kz_users where email=$1", [e])) return { ok: false, error: "Этот email уже занят" };
  await q("update kz_users set email=$2 where id=$1", [userId, e]);
  return { ok: true };
}

export async function ensureRefCode(userId: string, make: () => string): Promise<string> {
  const r = await one<{ ref_code: string | null }>("select ref_code from kz_users where id=$1", [userId]);
  if (r?.ref_code) return r.ref_code;
  for (let i = 0; i < 5; i++) {
    const code = make();
    const ok = await q("update kz_users set ref_code=$2 where id=$1 and ref_code is null and not exists (select 1 from kz_users where ref_code=$2) returning id", [userId, code]);
    if (ok.length) return code;
  }
  throw new Error("Не удалось создать код приглашения");
}

export async function referralStats(userId: string) {
  return one<{ signups: string; paid: string; earned: string }>(
    `select count(*) filter (where kind='signup') signups, count(*) filter (where kind='payment') paid, coalesce(sum(amount_kop),0) earned from kz_referral_events where referrer_id=$1`, [userId]);
}
