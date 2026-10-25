import { one, q, tx } from "./db";
import { notify, notifyPlatformAdmins } from "./notify";
import { mailConfigured, mailLayout, sendMail } from "./mail";

/** Поддержка: обращения клиентов и ответы администраторов платформы. */
export const CATEGORIES: Record<string, string> = {
  publish: "Не выходит публикация", channels: "Подключение каналов (VK, Telegram, MAX)", generate: "Создание материалов и картинок", billing: "Баланс, оплата, тариф",
  news: "Мониторинг новостей", account: "Вход, команда, доступы", idea: "Идея или пожелание", other: "Другое",
};
export const STATUS_LABEL: Record<string, string> = { open: "Ждёт ответа", answered: "Есть ответ", closed: "Закрыто" };

export interface Ticket { id: string; org_id: string; user_id: string; subject: string; category: string; status: string; page: string; created_at: string; updated_at: string; staff_replied_at: string | null; client_replied_at: string | null; client_read_at: string | null; staff_read_at: string | null }
export interface TicketMsg { id: string; staff: boolean; body: string; created_at: string; author: string }

const clip = (v: string, n: number) => v.replace(/\r/g, "").trim().slice(0, n);

export async function createTicket(c: { orgId: string; userId: string; email: string; name: string; plan: string; role: string }, f: { subject: string; category: string; body: string; page: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const subject = clip(f.subject, 120), body = clip(f.body, 5000);
  if (subject.length < 3) return { ok: false, error: "Коротко опишите тему обращения (минимум 3 знака)" };
  if (body.length < 10) return { ok: false, error: "Опишите проблему подробнее: что делали, что ожидали и что получилось" };
  const recent = Number((await one<{ n: string }>("select count(*) n from kz_tickets where user_id=$1 and created_at > now() - interval '1 hour'", [c.userId]))?.n ?? 0);
  if (recent >= 5) return { ok: false, error: "Слишком много обращений за час. Дополните одно из открытых ответом" };
  const category = f.category in CATEGORIES ? f.category : "other";
  const page = /^\/app[\w/\-?=&%.]{0,150}$/.test(f.page) ? f.page : "";
  const id = await tx(async (run) => {
    const [t] = await run<{ id: string }>("insert into kz_tickets(org_id,user_id,subject,category,page,meta,client_replied_at,client_read_at) values($1,$2,$3,$4,$5,$6,now(),now()) returning id",
      [c.orgId, c.userId, subject, category, page, JSON.stringify({ email: c.email, plan: c.plan, role: c.role })]);
    await run("insert into kz_ticket_messages(ticket_id,author_id,staff,body) values($1,$2,false,$3)", [t.id, c.userId, body]);
    return t.id;
  });
  void notifyPlatformAdmins({ kind: "support", title: `Новое обращение: ${subject.slice(0, 80)}`, body: `${c.name || c.email}: ${body.slice(0, 120)}`, href: `/app/admin/support/${id}`, dedupe: `tk:${id}` });
  void emailAdmins(`Новое обращение: ${subject}`, `${c.name || c.email} (${c.email}, тариф ${c.plan}) пишет:\n\n${body}`, `/app/admin/support/${id}`);
  return { ok: true, id };
}

async function emailAdmins(subject: string, text: string, path: string) {
  try {
    if (!(await mailConfigured())) return;
    const emails = (process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((x) => x.trim()).filter(Boolean);
    const base = (process.env.APP_URL || "").replace(/\/+$/, "");
    const m = mailLayout(subject, text, base ? { label: "Открыть обращение", url: `${base}${path}` } : undefined);
    for (const to of emails) await sendMail({ to, subject, text: m.text, html: m.html }).catch(() => {});
  } catch { /* необязательно */ }
}

export async function ticketFor(id: string): Promise<(Ticket & { email: string; name: string; org_name: string; plan: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one(`select t.*,u.email,u.name,o.name org_name,o.plan from kz_tickets t join kz_users u on u.id=t.user_id join kz_orgs o on o.id=t.org_id where t.id=$1`, [id]);
}

export async function messagesOf(id: string): Promise<TicketMsg[]> {
  return q<TicketMsg>("select m.id,m.staff,m.body,m.created_at,coalesce(nullif(u.name,''),u.email,'') author from kz_ticket_messages m left join kz_users u on u.id=m.author_id where m.ticket_id=$1 order by m.created_at", [id]);
}

export async function myTickets(userId: string, orgId: string, all: boolean): Promise<(Ticket & { unread: boolean })[]> {
  const rows = await (all
    ? q<Ticket>("select * from kz_tickets where org_id=$1 order by updated_at desc limit 50", [orgId])
    : q<Ticket>("select * from kz_tickets where user_id=$2 and org_id=$1 order by updated_at desc limit 50", [orgId, userId])).catch(() => []);
  return rows.map((t) => ({ ...t, unread: !!t.staff_replied_at && (!t.client_read_at || new Date(t.staff_replied_at) > new Date(t.client_read_at)) }));
}

export async function clientReply(ticketId: string, userId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const b = clip(body, 5000);
  if (b.length < 2) return { ok: false, error: "Напишите сообщение" };
  const t = await one<{ subject: string; org_id: string; status: string }>("select subject,org_id,status from kz_tickets where id=$1", [ticketId]);
  if (!t) return { ok: false, error: "Обращение не найдено" };
  await q("insert into kz_ticket_messages(ticket_id,author_id,staff,body) values($1,$2,false,$3)", [ticketId, userId, b]);
  await q("update kz_tickets set status='open', updated_at=now(), client_replied_at=now(), client_read_at=now() where id=$1", [ticketId]);
  void notifyPlatformAdmins({ kind: "support", title: `Ответ клиента: ${t.subject.slice(0, 80)}`, body: b.slice(0, 120), href: `/app/admin/support/${ticketId}`, dedupe: `tkr:${ticketId}:${Date.now()}` });
  return { ok: true };
}

export async function staffReply(ticketId: string, staffId: string, body: string, close = false): Promise<{ ok: boolean; error?: string }> {
  const b = clip(body, 5000);
  if (b.length < 2) return { ok: false, error: "Напишите ответ" };
  const t = await ticketFor(ticketId);
  if (!t) return { ok: false, error: "Обращение не найдено" };
  await q("insert into kz_ticket_messages(ticket_id,author_id,staff,body) values($1,$2,true,$3)", [ticketId, staffId, b]);
  await q("update kz_tickets set status=$2, updated_at=now(), staff_replied_at=now(), staff_read_at=now() where id=$1", [ticketId, close ? "closed" : "answered"]);
  await notify(t.org_id, { kind: "support", title: `Ответ поддержки: ${t.subject.slice(0, 80)}`, body: b.slice(0, 160), href: `/app/help/${ticketId}`, userId: t.user_id, dedupe: `tka:${ticketId}:${Date.now()}` });
  try {
    if (await mailConfigured()) {
      const base = (process.env.APP_URL || "").replace(/\/+$/, "");
      const m = mailLayout(`Ответ поддержки: ${t.subject}`, b, base ? { label: "Открыть обращение", url: `${base}/app/help/${ticketId}` } : undefined);
      await sendMail({ to: t.email, subject: `Ответ поддержки: ${t.subject}`, text: m.text, html: m.html });
    }
  } catch { /* почта необязательна: ответ виден в кабинете */ }
  return { ok: true };
}

export async function setTicketStatus(ticketId: string, status: string): Promise<void> {
  if (!["open", "answered", "closed"].includes(status)) return;
  await q("update kz_tickets set status=$2, updated_at=now() where id=$1", [ticketId, status]);
}

export async function markTicketRead(ticketId: string, who: "client" | "staff"): Promise<void> {
  await q(`update kz_tickets set ${who === "client" ? "client_read_at" : "staff_read_at"}=now() where id=$1`, [ticketId]).catch(() => {});
}

export async function adminTickets(filter: "open" | "answered" | "closed" | "all"): Promise<(Ticket & { email: string; org_name: string; waiting: boolean })[]> {
  const rows = await q<Ticket & { email: string; org_name: string }>(
    `select t.*,u.email,o.name org_name from kz_tickets t join kz_users u on u.id=t.user_id join kz_orgs o on o.id=t.org_id ${filter === "all" ? "" : "where t.status=$1"} order by (t.status='open') desc, t.updated_at desc limit 100`,
    filter === "all" ? [] : [filter]).catch(() => []);
  return rows.map((t) => ({ ...t, waiting: t.status === "open" }));
}
export async function openTicketCount(): Promise<number> {
  return Number((await one<{ n: string }>("select count(*) n from kz_tickets where status='open'").catch(() => null))?.n ?? 0);
}

/** Объявление всем организациям («специальные новости» от сервиса): в колокольчик владельцам, админам и редакторам. */
export async function broadcast(title: string, body: string, href: string): Promise<number> {
  const orgs = await q<{ id: string }>("select id from kz_orgs where not suspended");
  const key = `ann:${Date.now()}`;
  for (const o of orgs) await notify(o.id, { kind: "announce", title: title.slice(0, 120), body: body.slice(0, 300), href: /^\/app[\w/\-?=&%.]*$/.test(href) ? href : "", dedupe: key });
  return orgs.length;
}
