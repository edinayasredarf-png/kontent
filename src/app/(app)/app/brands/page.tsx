import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PageHead, Empty } from "@/components/ui";

export default async function Brands() {
  const c = await requireCtx();
  const rows = await q<{ id: string; name: string; description: string; tone: string; factories: string }>(
    `select b.id,b.name,b.description,b.tone,(select count(*) from kz_factories f where f.brand_id=b.id) factories from kz_brands b where b.org_id=$1 order by b.created_at`, [c.org.id]);
  const add = <Link href="/app/brands/new" className="btn"><Plus size={16} />Добавить бренд</Link>;
  return (
    <>
      <PageHead title="Бренды" sub="Компании, для которых вы делаете контент. У каждой — свой тон, правила и каналы." action={add} />
      {rows.length === 0 ? <Empty icon={<Building2 />} title="Брендов пока нет" text="Бренд — это профиль компании. Один бренд может иметь несколько заводов." action={add} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((b) => (
            <div key={b.id} className="card p-5">
              <div className="mb-1 font-medium">{b.name}</div>
              <p className="mb-3 line-clamp-2 min-h-10 text-sm text-ink2">{b.description || "Описание не заполнено"}</p>
              <div className="flex gap-2"><span className="chip">Заводов: {b.factories}</span><span className="chip">{b.tone}</span></div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
