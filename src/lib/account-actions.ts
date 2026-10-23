"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCtx, sessionCookie, logout } from "./auth";
import { cookies } from "next/headers";
import { q } from "./db";
import { changeEmail, changePassword, updateName } from "./account";
import { setTheme } from "./account";
import { mailConfigured, mailLayout, sendMail } from "./mail";
import { ROLE_LABEL } from "./team";
import { createGuestLink, revokeGuestLink } from "./guest";
import { acceptInvite, canManageTeam, createInvite, removeMember, revokeInvite, setRole } from "./team";

const s = (f: FormData, k: string) => String(f.get(k) ?? "");

async function origin() {
  const fixed = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

/** Отправляет письмо со ссылкой и возвращает пояснение для экрана; ошибка почты не отменяет созданную ссылку. */
async function sendLinkMail(to: string, subject: string, body: string, label: string, url: string): Promise<string> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return "Email указан неверно, письмо не отправлено. Передайте ссылку сами";
  if (!mailConfigured()) return `Почта на сервере не настроена (SMTP), письмо на ${to} не ушло. Передайте ссылку сами`;
  try {
    const m = mailLayout(subject, body, { label, url });
    await sendMail({ to, subject, text: m.text, html: m.html });
    return `Письмо со ссылкой отправлено на ${to}. Ссылка также здесь`;
  } catch (e) { return `Не удалось отправить письмо на ${to} (${(e as Error).message.slice(0, 80)}). Передайте ссылку сами`; }
}

export async function updateNameAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  if (c.user.guest) return { error: "Гостевой доступ нельзя менять: он только для просмотра" };
  const r = await updateName(c.user.id, s(f, "name"));
  if (!r.ok) return { error: r.error };
  revalidatePath("/app", "layout");
  return { ok: "Сохранено" };
}

export async function changeEmailAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  if (c.user.guest) return { error: "Гостевой доступ нельзя менять: он только для просмотра" };
  const r = await changeEmail(c.user.id, s(f, "email"), s(f, "password"));
  if (!r.ok) return { error: r.error };
  revalidatePath("/app", "layout");
  return { ok: "Email обновлён" };
}

export async function changePasswordAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  if (c.user.guest) return { error: "Гостевой доступ нельзя менять: он только для просмотра" };
  const r = await changePassword(c.user.id, s(f, "current"), s(f, "next"), s(f, "confirm"));
  if (!r.ok) return { error: r.error };
  // все прежние сессии аннулированы — текущему устройству выдаём новую, чтобы не выкидывать пользователя
  (await cookies()).set(await sessionCookie({ uid: c.user.id, org: c.org.id }));
  return { ok: "Пароль изменён. На других устройствах потребуется войти заново" };
}

export async function logoutEverywhereAction() {
  const c = await requireCtx();
  if (c.user.guest) { await logout(); redirect("/login"); }
  await q("update kz_users set session_ver=session_ver+1 where id=$1", [c.user.id]);
  await logout();
  redirect("/login");
}

export async function inviteAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  const r = await createInvite({ orgId: c.org.id, plan: c.org.plan, unlimited: c.org.unlimited, actorId: c.user.id, actorRole: c.org.role, email: s(f, "email"), role: s(f, "role"), origin: await origin() });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/team");
  const to = s(f, "email").trim().toLowerCase();
  const sent = to ? await sendLinkMail(to, `Приглашение в «${c.org.name}»`, `${c.user.name || c.user.email} приглашает вас в команду «${c.org.name}» на juicer.ai.\nРоль: ${ROLE_LABEL[s(f, "role")] ?? s(f, "role")}.\nСсылка действует 7 дней и открывается один раз.`, "Принять приглашение", r.link!) : "";
  return { ok: `${sent || "Ссылка-приглашение (действует 7 дней, одноразовая)"}: ${r.link}` };
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
  if (c.user.guest) redirect(`/invite/${encodeURIComponent(s(f, "token"))}?err=${encodeURIComponent("Гостевой доступ нельзя использовать для принятия приглашения: войдите под своим аккаунтом")}`);
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

export async function createGuestLinkAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  if (!canManageTeam(c.org.role)) return { error: "Гостевые ссылки создают владелец и администратор" };
  const r = await createGuestLink(c.org.id, c.user.id, s(f, "label"), s(f, "expiry"), await origin());
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/team");
  const to = s(f, "email").trim().toLowerCase();
  const sent = to ? await sendLinkMail(to, `Доступ для просмотра: «${c.org.name}»`, `${c.user.name || c.user.email} открыл вам доступ для просмотра материалов «${c.org.name}» на juicer.ai.\nРегистрация не нужна: изменять данные нельзя, только смотреть.`, "Открыть кабинет", r.link!) : "";
  return { ok: `${sent || "Ссылка для просмотра без регистрации (покажется один раз, скопируйте сейчас)"}: ${r.link}` };
}

export async function revokeGuestLinkAction(f: FormData) {
  const c = await requireCtx();
  if (!canManageTeam(c.org.role)) return;
  await revokeGuestLink(c.org.id, s(f, "id"));
  revalidatePath("/app/team");
}
