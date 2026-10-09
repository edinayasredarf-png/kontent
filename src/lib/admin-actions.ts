"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { adjustBalance, audit, forceLogout, requireAdmin, setOrgPlan, setOrgSuspended, setUserDisabled } from "./admin";
import { one } from "./db";
import { createResetToken } from "./reset";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = (r: { ok: boolean; error?: string; message?: string }, path: string) => { revalidatePath(path); return r.ok ? { ok: r.message ?? "Готово" } : { error: r.error }; };

async function origin() {
  const fixed = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers(); const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

export async function adjustBalanceAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  const rub = Number(s(f, "amount").replace(",", ".").replace(/\s/g, ""));
  return done(await adjustBalance(c.user, s(f, "org"), rub, s(f, "reason")), `/app/admin/orgs/${s(f, "org")}`);
}
export async function setPlanAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  return done(await setOrgPlan(c.user, s(f, "org"), s(f, "plan")), `/app/admin/orgs/${s(f, "org")}`);
}
export async function suspendOrgAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  return done(await setOrgSuspended(c.user, s(f, "org"), s(f, "suspend") === "1"), `/app/admin/orgs/${s(f, "org")}`);
}
export async function disableUserAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  return done(await setUserDisabled(c.user, s(f, "user"), s(f, "disable") === "1"), "/app/admin");
}
export async function logoutUserAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  return done(await forceLogout(c.user, s(f, "user")), "/app/admin");
}

/** Ссылка для сброса пароля, которую администратор передаёт человеку сам (когда почта не настроена или письмо не дошло). Действует час, одноразовая. */
export async function resetLinkAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  const u = await one<{ id: string; email: string; disabled: boolean }>("select id,email,disabled from kz_users where id=$1", [s(f, "user")]);
  if (!u) return { error: "Пользователь не найден" };
  if (u.disabled) return { error: "Пользователь заблокирован" };
  const token = await createResetToken(u.id);
  await audit(c.user, "user.reset_link", "user", u.id);
  return { ok: `Ссылка для ${u.email} (действует 60 минут, одноразовая): ${await origin()}/reset/${token}` };
}
