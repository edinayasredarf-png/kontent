import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { Empty } from "@/components/ui";
import { OrgTabs } from "@/components/shell/OrgTabs";

export const dynamic = "force-dynamic";

/** Вкладка «База знаний»: открывает базу первого бренда (переключатель брендов — на самой странице). */
export default async function KnowledgeIndex() {
  const c = await requireCtx();
  const [b] = await q<{ id: string }>("select id from kz_brands where org_id=$1 order by created_at limit 1", [c.org.id]);
  if (b) redirect(`/app/brands/${b.id}/knowledge`);
  return (
    <>
      <OrgTabs />
      <Empty icon={<Building2 />} title="Сначала создайте бренд" text="База знаний хранится внутри бренда: статьи, документы и сравнения, по которым ИИ учится писать в вашем стиле." action={<Link href="/app/brands/new" className="btn-rect">Добавить бренд</Link>} />
    </>
  );
}
