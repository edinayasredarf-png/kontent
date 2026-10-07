import { notFound } from "next/navigation";
import { Check, X, Sparkles, Pause, Play, Trash2, AlertTriangle } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { PRICES, rub } from "@/lib/wallet";
import { deleteFactory, generateItemAction, generatePlanAction, saveBody, setItemStatus, toggleFactory } from "@/lib/actions";
import { PageHead, Status, KIND } from "@/components/ui";

interface Item { id: string; kind: string; topic: string; hook: string; body: string; status: string; planned_for: string | null }

export default async function FactoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { id } = await params;
  const { err } = await searchParams;
  const c = await requireCtx();
  const f = await one<{ id: string; name: string; brand: string; status: string; niche: string; product: string }>(
    "select f.id,f.name,b.name brand,f.status,f.niche,f.product from factories f join brands b on b.id=f.brand_id where f.id=$1 and f.org_id=$2", [id, c.org.id]);
  if (!f) notFound();
  const items = await q<Item>(
    "select id,kind,topic,hook,body,status,to_char(planned_for,'YYYY-MM-DD') planned_for from content_items where factory_id=$1 and org_id=$2 order by planned_for nulls last, created_at", [id, c.org.id]);
  const hid = <input type="hidden" name="id" value={id} />;
  return (
    <>
      <PageHead title={f.name} sub={`${f.brand}${f.niche ? " · " + f.niche : ""}`} action={
        <div className="flex gap-2">
          <form action={toggleFactory}>{hid}<button className="btn btn-ghost">{f.status === "active" ? <><Pause size={15} />Пауза</> : <><Play size={15} />Запустить</>}</button></form>
          <form action={deleteFactory}>{hid}<button className="btn btn-danger" title="Удалить завод"><Trash2 size={15} /></button></form>
        </div>} />
      {err && <div className="mb-4 flex items-center gap-2 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{err}</div>}
      <form action={generatePlanAction} className="card mb-6 flex flex-wrap items-center gap-3 p-4">
        {hid}
        <div className="mr-auto"><b className="text-sm">Контент-план</b><p className="text-xs text-ink2">Новые темы не повторяют уже существующие · {rub(PRICES.plan_day)} за день</p></div>
        <select name="days" defaultValue="7" className="input !w-auto">{[7, 14, 30].map((d) => <option key={d} value={d}>{d} дней — {rub(d * PRICES.plan_day)}</option>)}</select>
        <button className="btn btn-accent"><Sparkles size={15} />Сгенерировать</button>
      </form>
      {items.length === 0 && <p className="card px-6 py-12 text-center text-sm text-ink2">План пуст. Нажмите «Сгенерировать».</p>}
      <div className="space-y-3">
        {items.map((i) => (
          <details key={i.id} className="card group p-4 open:shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
              <span className="w-20 text-xs text-ink3">{i.planned_for ? new Date(i.planned_for).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—"}</span>
              <span className="chip">{KIND[i.kind]}</span>
              <span className="min-w-0 flex-1 text-sm font-medium">{i.topic}</span>
              <Status s={i.status} />
            </summary>
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              {i.hook && <p className="text-sm text-ink2"><b>Хук:</b> {i.hook}</p>}
              {i.body ? (
                <form action={saveBody} className="space-y-2">
                  <input type="hidden" name="id" value={i.id} />
                  <textarea name="body" defaultValue={i.body} rows={10} className="input font-mono !text-[13px]" />
                  <button className="btn btn-ghost">Сохранить правки</button>
                </form>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {["idea", "approved"].includes(i.status) && (<>
                  {i.status === "idea" && <form action={setItemStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="approved" /><button className="btn btn-ghost"><Check size={15} />Одобрить</button></form>}
                  <form action={setItemStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="rejected" /><button className="btn btn-ghost"><X size={15} />Отклонить</button></form>
                </>)}
                {["idea", "approved", "failed"].includes(i.status) && <form action={generateItemAction}><input type="hidden" name="id" value={i.id} /><button className="btn btn-accent"><Sparkles size={15} />Написать</button></form>}
              </div>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
