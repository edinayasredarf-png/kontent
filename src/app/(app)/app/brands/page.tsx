import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PageHead, Empty } from "@/components/ui";

export default async function Brands() {
  const c = await requireCtx();
  const rows = await q<{ id: string; name: string; description: string; tone: string; factories: string }>(
    `select b.id,b.name,b.description,b.tone,(select count(*) from kz_factories f where f.brand_id=b.id) factories from kz_brands b where b.org_id=$1 order by b.created_at`, [c.org.id]);
  const add = !canWrite(c.org.role) ? null : <Link href="/app/brands/new" className="pill"><Plus size={16} />Добавить бренд</Link>;
  return (
    <>
      <PageHead title="Бренды" sub="Компании, для которых вы делаете контент. У каждой — свой тон, правила и каналы." action={add} />
      {rows.length === 0 ? <Empty icon={<Building2 />} title="Брендов пока нет" text="Бренд — это профиль компании. Один бренд может иметь несколько заводов." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <Link key={b.id} href={`/app/brands/${b.id}`} className="block rounded-3xl bg-tile p-6 transition hover:bg-tile2">
              <div className="mb-1 text-lg font-semibold">{b.name}</div>
              <p className="mb-3 line-clamp-2 text-sm text-ink2">{b.description || "Описание не заполнено"}</p>
              <div className="flex flex-wrap gap-2"><span className="chip">Заводов: {b.factories}</span><span className="chip">{b.tone}</span><span className="chip !bg-accent-soft !text-accent-ink">Брендбук →</span></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
