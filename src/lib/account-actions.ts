"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCtx, sessionCookie, logout } from "./auth";
import { cookies } from "next/headers";
import { q } from "./db";
import { changeEmail, changePassword, updateName } from "./account";
import { setTheme } from "./account";
import { acceptInvite, createInvite, removeMember, revokeInvite, setRole } from "./team";

const s = (f: FormData, k: string) => String(f.get(k) ?? "");

async function origin() {
  const fixed = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

export async function updateNameAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  const r = await updateName(c.user.id, s(f, "name"));
  if (!r.ok) return { error: r.error };
  revalidatePath("/app", "layout");
  return { ok: "Сохранено" };
}

export async function changeEmailAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  const r = await changeEmail(c.user.id, s(f, "email"), s(f, "password"));
  if (!r.ok) return { error: r.error };
  revalidatePath("/app", "layout");
  return { ok: "Email обновлён" };
}

export async function changePasswordAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  const r = await changePassword(c.user.id, s(f, "current"), s(f, "next"), s(f, "confirm"));
  if (!r.ok) return { error: r.error };
  // все прежние сессии аннулированы — текущему устройству выдаём новую, чтобы не выкидывать пользователя
  (await cookies()).set(await sessionCookie({ uid: c.user.id, org: c.org.id }));
  return { ok: "Пароль изменён. На других устройствах потребуется войти заново" };
}

export async function logoutEverywhereAction() {
  const c = await requireCtx();
  await q("update kz_users set session_ver=session_ver+1 where id=$1", [c.user.id]);
  await logout();
  redirect("/login");
}

export async function inviteAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  const r = await createInvite({ orgId: c.org.id, plan: c.org.plan, unlimited: c.org.unlimited, actorId: c.user.id, actorRole: c.org.role, email: s(f, "email"), role: s(f, "role"), origin: await origin() });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/team");
  return { ok: `Ссылка-приглашение (действует 7 дней, одноразовая): ${r.link}` };
}

export async function revokeInviteAction(f: FormData) {
  const c = await requireCtx();
  await revokeInvite(c.org.id, c.org.role, s(f, "id"));
  revalidatePath("/app/team");
}

export async function setRoleAction(f: FormData) {
  const c = await requireCtx();
  await setRole(c.org.id, c.user.id, c.org.role, s(f, "user"), s(f, "role"));
  revalidatePath("/app/team");
}

export async function removeMemberAction(f: FormData) {
  const c = await requireCtx();
  const self = s(f, "user") === c.user.id;
  const r = await removeMember(c.org.id, c.user.id, c.org.role, s(f, "user"));
  if (r.ok && self) { await logout(); redirect("/login"); }
  revalidatePath("/app/team");
}

export async function acceptInviteAction(f: FormData) {
  const c = await requireCtx();
  const r = await acceptInvite(s(f, "token"), { id: c.user.id, email: c.user.email });
  if (!r.ok) redirect(`/invite/${encodeURIComponent(s(f, "token"))}?err=${encodeURIComponent(r.error)}`);
  (await cookies()).set(await sessionCookie({ uid: c.user.id, org: r.orgId }));
  redirect("/app");
}

export async function setThemeAction(theme: string) {
  const c = await requireCtx();
  const r = await setTheme(c.user.id, theme);
  if (!r.ok) return { error: r.error };
  // cookie тоже ставим на сервере (на случай, если браузер не дал записать с клиента)
  (await cookies()).set("lt_theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/app", "layout");
  return {};
}
