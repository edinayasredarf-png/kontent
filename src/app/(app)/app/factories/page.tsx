import Link from "next/link";
import { Factory, Plus } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PageHead, Empty } from "@/components/ui";

export default async function Factories() {
  const c = await requireCtx();
  const rows = await q<{ id: string; name: string; brand: string; status: string; formats: string[]; ideas: string; ready: string; autopublish: boolean }>(
    `select f.id,f.name,b.name brand,f.status,f.formats,f.autopublish,
            (select count(*) from kz_content_items i where i.factory_id=f.id and i.status='idea') ideas,
            (select count(*) from kz_content_items i where i.factory_id=f.id and i.status='ready') ready
       from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 order by f.created_at desc`, [c.org.id]);
  const add = !canWrite(c.org.role) ? null : <Link href="/app/factories/new" className="pill"><Plus size={16} />Создать завод</Link>;
  return (
    <>
      <PageHead title="Заводы" sub="Завод — автоматический конвейер: идеи → текст → публикация." action={add} />
      {rows.length === 0 ? <Empty icon={<Factory />} title="Заводов пока нет" text="Создайте бренд, затем завод — он сам предложит темы и напишет материалы." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((f) => (
            <Link key={f.id} href={`/app/factories/${f.id}`} className="block rounded-3xl bg-tile p-6 transition hover:bg-tile2">
              <b className="block text-lg font-semibold">{f.name}</b>
              <div className="mt-2 flex flex-wrap gap-2"><span className={`chip ${f.status === "active" ? "!bg-good-soft !text-good" : ""}`}>{f.status === "active" ? "работает" : "пауза"}</span><span className="chip">{f.brand}</span></div>
              <div className="mt-4 flex flex-wrap gap-2"><span className="chip">Идей: {f.ideas}</span><span className="chip">Готово: {f.ready}</span>{f.autopublish && <span className="chip">Автопубликация</span>}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}