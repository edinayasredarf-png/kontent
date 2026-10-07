import Link from "next/link";
import { Factory, Plus } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PageHead, Empty } from "@/components/ui";

export default async function Factories() {
  const c = await requireCtx();
  const rows = await q<{ id: string; name: string; brand: string; status: string; formats: string[]; ideas: string; ready: string; autopublish: boolean }>(
    `select f.id,f.name,b.name brand,f.status,f.formats,f.autopublish,
            (select count(*) from kz_content_items i where i.factory_id=f.id and i.status='idea') ideas,
            (select count(*) from kz_content_items i where i.factory_id=f.id and i.status='ready') ready
       from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 order by f.created_at desc`, [c.org.id]);
  const add = <Link href="/app/factories/new" className="btn btn-accent"><Plus size={16} />Создать завод</Link>;
  return (
    <>
      <PageHead title="Заводы" sub="Завод — автоматический конвейер: идеи → текст → публикация." action={add} />
      {rows.length === 0 ? <Empty icon={<Factory />} title="Заводов пока нет" text="Создайте бренд, затем завод — он сам предложит темы и напишет материалы." action={add} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((f) => (
            <Link key={f.id} href={`/app/factories/${f.id}`} className="card p-5 transition hover:border-accent/40">
              <div className="mb-1 flex items-center justify-between"><b>{f.name}</b><span className={`chip ${f.status === "active" ? "!bg-good-soft !text-good" : ""}`}>{f.status === "active" ? "Работает" : "Пауза"}</span></div>
              <p className="mb-3 text-sm text-ink2">{f.brand}</p>
              <div className="flex flex-wrap gap-2"><span className="chip">Идей: {f.ideas}</span><span className="chip">Готово: {f.ready}</span>{f.autopublish && <span className="chip">Автопубликация</span>}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
