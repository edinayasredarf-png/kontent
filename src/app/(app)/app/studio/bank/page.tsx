import Link from "next/link";
import { ArrowLeft, Bookmark, Trash2 } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { KINDS } from "@/lib/plan";
import { addBankAction, bankToPlanAction, deleteBankAction } from "@/lib/studio-actions";
import { Form, Field } from "@/components/Form";
import { Empty, KIND, PageHead } from "@/components/ui";

export default async function Bank({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const c = await requireCtx();
  const [rows, factories] = await Promise.all([
    q<{ id: string; title: string; body: string; source: string; created_at: string }>("select id,title,body,source,created_at from kz_bank where org_id=$1 order by created_at desc limit 200", [c.org.id]),
    q<{ id: string; name: string }>("select id,name from kz_factories where org_id=$1 and status='active' order by name", [c.org.id]),
  ]);
  return (
    <>
      <Link href="/app/studio" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Студия</Link>
      <PageHead title="Банк идей" sub="Заготовки и идеи про запас. Любую можно отправить в контент-план завода." />
      {err && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          {rows.length === 0 && <Empty icon={<Bookmark />} title="Банк пуст" text="Сохраняйте сюда результаты студии кнопкой «В банк идей» или добавляйте идеи вручную." />}
          {rows.map((r) => (
            <article key={r.id} className="card p-4">
              <div className="mb-1 flex items-start gap-2"><b className="flex-1 text-sm">{r.title}</b>{r.source && <span className="chip">{r.source}</span>}
                <form action={deleteBankAction}><input type="hidden" name="id" value={r.id} /><button className="text-ink3 hover:text-bad" title="Удалить"><Trash2 size={15} /></button></form></div>
              {r.body && r.body !== r.title && <p className="line-clamp-4 whitespace-pre-wrap text-sm text-ink2">{r.body}</p>}
              {factories.length > 0 && (
                <form action={bankToPlanAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <input type="hidden" name="id" value={r.id} />
                  <select name="factory" className="input !w-auto !py-1.5 text-xs">{factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                  <select name="kind" className="input !w-auto !py-1.5 text-xs">{KINDS.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
                  <button className="btn btn-ghost !py-1.5 text-xs">В план завода</button>
                </form>
              )}
            </article>))}
        </div>
        <section className="card h-fit p-5">
          <b className="mb-4 block text-sm">Добавить идею</b>
          <Form action={addBankAction} submit="Добавить">
            <Field label="Идея"><input name="title" required minLength={3} maxLength={200} className="input" /></Field>
            <Field label="Заметки (необязательно)"><textarea name="body" rows={4} maxLength={8000} className="input" /></Field>
          </Form>
        </section>
      </div>
    </>
  );
}
