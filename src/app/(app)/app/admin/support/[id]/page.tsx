import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { CATEGORIES, STATUS_LABEL, markTicketRead, messagesOf, ticketFor } from "@/lib/support";
import { adminReplyAction, adminStatusAction } from "@/lib/support-actions";
import { Form, Field } from "@/components/Form";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";
const when = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const t = await ticketFor(id);
  if (!t) notFound();
  await markTicketRead(id, "staff");
  const msgs = await messagesOf(id);
  const meta = (t as unknown as { meta?: { plan?: string; role?: string } }).meta ?? {};
  return (
    <div className="mx-auto w-full max-w-[820px]">
      <Link href="/app/admin/support" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Все обращения</Link>
      <div className="mb-2 flex flex-wrap items-center gap-3"><h2 className="min-w-0 flex-1 text-2xl font-semibold">{t.subject}</h2><span className="chip">{STATUS_LABEL[t.status]}</span></div>
      <div className="mb-5 grid gap-1 rounded-2xl bg-tile p-4 text-sm sm:grid-cols-2">
        <div><span className="text-ink3">Клиент: </span>{t.name || "—"} · {t.email}</div>
        <div><span className="text-ink3">Организация: </span>{t.org_name} ({t.plan}, роль {meta.role ?? "—"})</div>
        <div><span className="text-ink3">Тема: </span>{CATEGORIES[t.category] ?? t.category}</div>
        <div><span className="text-ink3">Страница: </span>{t.page || "—"}</div>
        <div><span className="text-ink3">Создано: </span>{when(t.created_at)}</div>
        <div><Link href={`/app/admin/orgs/${t.org_id}`} className="link-btn">Карточка организации</Link></div>
      </div>
      <div className="space-y-3">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.staff ? "justify-end" : ""}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.staff ? "bg-accent-soft" : "bg-tile"}`}>
              <div className="mb-1 text-xs text-ink3">{m.staff ? `Поддержка (${m.author})` : m.author} · {when(m.created_at)}</div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>))}
      </div>
      <div className="mt-6">
        <Form action={adminReplyAction} submit="Ответить клиенту">
          <input type="hidden" name="id" value={id} />
          <Field label="Ответ"><textarea name="body" required rows={5} maxLength={5000} className="input" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="close" /> Закрыть обращение после ответа</label>
        </Form>
        <form action={adminStatusAction} className="mt-3 flex flex-wrap gap-2 text-xs">
          <input type="hidden" name="id" value={id} />
          {["open", "answered", "closed"].filter((x) => x !== t.status).map((x) => <button key={x} name="status" value={x} className="chip cursor-pointer">Пометить: {STATUS_LABEL[x]}</button>)}
          <SubmitButton className="hidden">ok</SubmitButton>
        </form>
      </div>
    </div>
  );
}
