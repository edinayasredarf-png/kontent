"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "./auth";
import { requireAdmin } from "./admin";
import { broadcast, clientReply, createTicket, markTicketRead, setTicketStatus, staffReply, ticketFor } from "./support";
import { can } from "./roles";
import { audit } from "./admin";

const s = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Клиент: новое обращение. Гостевой доступ писать в поддержку не может. */
export async function createTicketAction(_: unknown, f: FormData) {
  const c = await requireCtx();
  if (c.user.guest) return { error: "Гостевой доступ не может писать в поддержку" };
  const r = await createTicket({ orgId: c.org.id, userId: c.user.id, email: c.user.email, name: c.user.name, plan: c.org.plan, role: c.org.role }, { subject: s(f, "subject"), category: s(f, "category"), body: s(f, "body"), page: s(f, "page") });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/help");
  redirect(`/app/help/${r.id}?new=1`);
}

/** Доступ к обращению: автор, а также владелец и администратор той же организации. */
async function mine(id: string) {
  const c = await requireCtx();
  const t = await ticketFor(id);
  if (!t || t.org_id !== c.org.id || (t.user_id !== c.user.id && !can(c.org.role, "manage"))) return null;
  return { c, t };
}

export async function replyTicketAction(_: unknown, f: FormData) {
  const m = await mine(s(f, "id"));
  if (!m) return { error: "Обращение не найдено" };
  const r = await clientReply(m.t.id, m.c.user.id, s(f, "body"));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/app/help/${m.t.id}`); revalidatePath("/app/help");
  return { ok: "Отправлено" };
}

export async function closeTicketAction(f: FormData) {
  const m = await mine(s(f, "id"));
  if (!m) return;
  await setTicketStatus(m.t.id, "closed");
  revalidatePath(`/app/help/${m.t.id}`); revalidatePath("/app/help");
}

export async function readTicketAction(id: string) {
  const m = await mine(id);
  if (m && m.t.user_id === m.c.user.id) await markTicketRead(id, "client");
}

/** Администратор платформы. */
export async function adminReplyAction(_: unknown, f: FormData) {
  const a = await requireAdmin();
  const r = await staffReply(s(f, "id"), a.user.id, s(f, "body"), f.get("close") === "on");
  if (!r.ok) return { error: r.error };
  await audit({ id: a.user.id, email: a.user.email }, "support.reply", "ticket", s(f, "id"), {}).catch(() => {});
  revalidatePath(`/app/admin/support/${s(f, "id")}`); revalidatePath("/app/admin/support");
  return { ok: "Ответ отправлен клиенту, он увидит его в разделе «Помощь» и в колокольчике" };
}

export async function adminStatusAction(f: FormData) {
  await requireAdmin();
  await setTicketStatus(s(f, "id"), s(f, "status"));
  revalidatePath(`/app/admin/support/${s(f, "id")}`); revalidatePath("/app/admin/support");
}

export async function broadcastAction(_: unknown, f: FormData) {
  const a = await requireAdmin();
  const title = s(f, "title").trim();
  if (title.length < 4) return { error: "Напишите заголовок объявления" };
  const n = await broadcast(title, s(f, "body"), s(f, "href"));
  await audit({ id: a.user.id, email: a.user.email }, "support.broadcast", "org", "all", { title, orgs: n }).catch(() => {});
  return { ok: `Отправлено организациям: ${n}` };
}

export async function adminOpenAction(id: string) {
  await requireAdmin();
  await markTicketRead(id, "staff");
}
