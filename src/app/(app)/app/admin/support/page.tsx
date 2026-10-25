import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { CATEGORIES, STATUS_LABEL, adminTickets, openTicketCount } from "@/lib/support";
import { broadcastAction } from "@/lib/support-actions";
import { AdminNav } from "@/components/AdminNav";
import { Form, Field } from "@/components/Form";
import { PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

const when = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
const FILTERS: [string, string][] = [["open", "Ждут ответа"], ["answered", "Отвечено"], ["closed", "Закрытые"], ["all", "Все"]];

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireAdmin();
  const { s } = await searchParams;
  const filter = (["open", "answered", "closed", "all"].includes(s ?? "") ? s : "open") as "open" | "answered" | "closed" | "all";
  const [rows, open] = await Promise.all([adminTickets(filter), openTicketCount()]);
  return (
    <>
      <PageHead title="Поддержка" sub={`Обращения клиентов. Ждут ответа: ${open}`} />
      <AdminNav active="/app/admin/support" />
      <div className="mb-4 flex flex-wrap gap-1 text-sm">{FILTERS.map(([k, l]) => <Link key={k} href={`/app/admin/support?s=${k}`} className={`rounded-lg px-3 py-1.5 ${filter === k ? "bg-tile font-medium" : "text-ink2 hover:bg-tile/60"}`}>{l}{k === "open" && open ? ` (${open})` : ""}</Link>)}</div>
      <div className="card mb-8">
        {rows.length === 0 && <p className="px-5 py-4 text-sm text-ink3">Обращений нет.</p>}
        {rows.map((t) => (
          <Link key={t.id} href={`/app/admin/support/${t.id}`} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0 hover:bg-accent-soft/50">
            <span className="min-w-0 flex-1"><b className="block truncate text-sm font-medium">{t.waiting && <span className="mr-2 inline-block size-2 rounded-full bg-warn align-middle" />}{t.subject}</b>
              <span className="text-xs text-ink3">{t.org_name} · {t.email} · {CATEGORIES[t.category] ?? t.category} · {when(t.updated_at)}</span></span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${t.status === "open" ? "bg-warn-soft text-warn" : t.status === "answered" ? "bg-good-soft text-good" : "bg-tile text-ink3"}`}>{STATUS_LABEL[t.status]}</span>
          </Link>))}
      </div>
      <section className="mx-auto max-w-[640px]">
        <h3 className="mb-1 text-base font-semibold">Объявление всем клиентам</h3>
        <p className="mb-3 text-sm text-ink2">Появится в колокольчике у владельцев, администраторов и редакторов всех организаций: новая функция, плановые работы, важное изменение.</p>
        <div className="card p-5">
          <Form action={broadcastAction} submit="Отправить всем">
            <Field label="Заголовок"><input name="title" required maxLength={120} className="input" placeholder="Например: В чате появилась правка выделенного текста" /></Field>
            <Field label="Текст (необязательно)"><textarea name="body" rows={3} maxLength={300} className="input" /></Field>
            <Field label="Ссылка внутри сервиса (необязательно)"><input name="href" className="input" placeholder="/app/help" /></Field>
          </Form>
        </div>
      </section>
    </>
  );
}
