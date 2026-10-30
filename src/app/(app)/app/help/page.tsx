import Link from "next/link";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { can } from "@/lib/roles";
import { CATEGORIES, STATUS_LABEL, myTickets } from "@/lib/support";
import { FAQ, GUIDE, TOPICS } from "@/lib/guides";
import { createTicketAction } from "@/lib/support-actions";
import { Form, Field } from "@/components/Form";
import { ModalButton } from "@/components/ui/ModalButton";
import { PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Помощь" };

const CHANNEL_GUIDES: [string, string][] = [["telegram", "Telegram"], ["vk", "ВКонтакте"], ["max", "MAX"], ["wordpress", "WordPress"], ["webhook", "Webhook"]];
const when = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
const chip = (st: string) => (st === "answered" ? "bg-good-soft text-good" : st === "closed" ? "bg-tile text-ink3" : "bg-warn-soft text-warn");

function Guide({ title, lead, steps }: { title: string; lead?: string; steps: string[] }) {
  return (
    <details className="group border-b border-line last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 text-sm font-medium hover:bg-accent-soft/50"><span className="flex-1">{title}</span><span className="text-ink3 transition group-open:rotate-90">›</span></summary>
      <div className="px-5 pb-4 text-sm leading-6 text-ink2">
        {lead && <p className="mb-2">{lead}</p>}
        <ol className="list-decimal space-y-1.5 pl-5">{steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
      </div>
    </details>
  );
}

export default async function Help({ searchParams }: { searchParams: Promise<{ from?: string; new?: string }> }) {
  const { from } = await searchParams;
  const c = await requireCtx();
  if (c.user.guest) redirect("/app/overview");
  const tickets = await myTickets(c.user.id, c.org.id, can(c.org.role, "manage"));
  return (
    <>
      <PageHead title="Помощь" sub="Инструкции, ответы на частые вопросы и связь с поддержкой." action={
        <ModalButton label="Сообщить о проблеме" title="Сообщить о проблеме или задать вопрос" icon={<LifeBuoy size={16} />}>
          <Form action={createTicketAction} submit="Отправить в поддержку">
            <input type="hidden" name="page" value={from ?? ""} />
            <Field label="О чём вопрос"><select name="category" className="input" defaultValue="other">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Коротко: в чём проблема"><input name="subject" required maxLength={120} className="input" placeholder="Например: пост не вышел в VK" /></Field>
            <Field label="Подробности"><textarea name="body" required rows={6} maxLength={5000} className="input" placeholder="Что вы делали, что ожидали и что получилось. Название материала и канала, текст ошибки, если она есть." /></Field>
            <p className="text-xs text-ink3">Ответ придёт в этот раздел и в колокольчик{from ? `; мы увидим, с какой страницы вы пишете (${from})` : ""}. Пароли и токены в обращение не вставляйте.</p>
          </Form>
        </ModalButton>} />
      <div className="w-full max-w-[760px] space-y-8">
        <section>
          <h3 className="mb-3 text-base font-semibold">Мои обращения</h3>
          <div className="card">
            {tickets.length === 0 && <p className="px-5 py-4 text-sm text-ink3">Обращений пока нет. Если что-то не работает, нажмите «Сообщить о проблеме».</p>}
            {tickets.map((t) => (
              <Link key={t.id} href={`/app/help/${t.id}`} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0 hover:bg-accent-soft/50">
                <span className="min-w-0 flex-1"><b className="block truncate text-sm font-medium">{t.unread && <span className="mr-2 inline-block size-2 rounded-full bg-accent align-middle" />}{t.subject}</b>
                  <span className="text-xs text-ink3">{CATEGORIES[t.category] ?? t.category} · {when(t.updated_at)}</span></span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${chip(t.status)}`}>{t.unread ? "Новый ответ" : STATUS_LABEL[t.status]}</span>
              </Link>))}
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-base font-semibold">Подключение каналов</h3>
          <div className="card">{CHANNEL_GUIDES.map(([k, n]) => <Guide key={k} title={GUIDE[k].title} steps={GUIDE[k].steps} />)}</div>
        </section>
        <section>
          <h3 className="mb-3 text-base font-semibold">Как пользоваться сервисом</h3>
          <div className="card">{TOPICS.map((t) => <Guide key={t.id} title={t.title} lead={t.lead} steps={t.steps} />)}</div>
        </section>
        <section>
          <h3 className="mb-3 text-base font-semibold">Частые вопросы</h3>
          <div className="card">{FAQ.map((f) => (
            <details key={f.q} className="group border-b border-line last:border-0">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 text-sm font-medium hover:bg-accent-soft/50"><span className="flex-1">{f.q}</span><span className="text-ink3 transition group-open:rotate-90">›</span></summary>
              <p className="px-5 pb-4 text-sm leading-6 text-ink2">{f.a}</p>
            </details>))}</div>
        </section>
      </div>
    </>
  );
}
