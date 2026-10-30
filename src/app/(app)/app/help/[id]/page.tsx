import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { can } from "@/lib/roles";
import { CATEGORIES, STATUS_LABEL, markTicketRead, messagesOf, ticketFor } from "@/lib/support";
import { closeTicketAction, replyTicketAction } from "@/lib/support-actions";
import { Form, Field } from "@/components/Form";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const when = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const c = await requireCtx();
  if (c.user.guest) redirect("/app/overview");
  const t = await ticketFor(id);
  if (!t || t.org_id !== c.org.id || (t.user_id !== c.user.id && !can(c.org.role, "manage"))) notFound();
  if (t.user_id === c.user.id) await markTicketRead(id, "client");
  const msgs = await messagesOf(id);
  return (
    <div className="w-full max-w-[760px]">
      <Link href="/app/help" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Помощь</Link>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 text-2xl font-semibold">{t.subject}</h2>
        <span className="chip">{STATUS_LABEL[t.status]}</span>
      </div>
      <p className="mb-5 text-xs text-ink3">{CATEGORIES[t.category] ?? t.category} · создано {when(t.created_at)}</p>
      {isNew && <p className="mb-4 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">Обращение отправлено. Мы ответим здесь и пришлём уведомление в колокольчик.</p>}
      <div className="space-y-3">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.staff ? "" : "justify-end"}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.staff ? "bg-tile" : "bg-accent-soft"}`}>
              <div className="mb-1 text-xs text-ink3">{m.staff ? "Поддержка" : m.author || "Вы"} · {when(m.created_at)}</div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>))}
      </div>
      {t.status !== "closed" ? (
        <div className="mt-6 space-y-3">
          <Form action={replyTicketAction} submit="Отправить" className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <Field label="Ваше сообщение"><textarea name="body" required rows={4} maxLength={5000} className="input" placeholder="Дополните обращение или ответьте поддержке" /></Field>
          </Form>
          <form action={closeTicketAction}><input type="hidden" name="id" value={id} /><SubmitButton className="text-xs text-ink3 hover:text-ink">Вопрос решён, закрыть обращение</SubmitButton></form>
        </div>
      ) : <p className="mt-6 text-sm text-ink3">Обращение закрыто. Если проблема вернулась, создайте новое в разделе «Помощь».</p>}
    </div>
  );
}
