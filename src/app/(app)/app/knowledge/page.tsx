import { Building2 } from "lucide-react";
import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { Empty } from "@/components/ui";
import { OrgTabs } from "@/components/shell/OrgTabs";

export const dynamic = "force-dynamic";

export default async function KnowledgeIndex() {
  const c = await requireCtx();
  const brands = await q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]);
  if (brands.length) return <>
    <OrgTabs />
    <h1 className="mb-2 text-2xl font-semibold">База знаний бренда</h1>
    <p className="mb-5 text-sm text-ink2">Выберите бренд. Его документы используют заводы, привязанные к этому бренду.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{brands.map(brand =>
      <Link key={brand.id} href={`/app/brands/${brand.id}/knowledge`} className="card flex items-center gap-3 p-4 hover:bg-tile">
        <Building2 size={18} />{brand.name}
      </Link>
    )}</div>
  </>;
  return (
    <>
      <OrgTabs />
      <Empty icon={<Building2 />} title="Сначала создайте бренд" text="База знаний хранится внутри бренда: статьи, документы и сравнения, по которым ИИ учится писать в вашем стиле." action={<Link href="/app/brands/new" className="btn-rect">Добавить бренд</Link>} />
    </>
  );
}
