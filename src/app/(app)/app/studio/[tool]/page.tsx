import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { toolByKey } from "@/lib/studio";
import { ToolRunner } from "@/components/ToolRunner";
import { PageHead } from "@/components/ui";

export const maxDuration = 120;

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = toolByKey(tool);
  if (!t) notFound();
  const c = await requireCtx();
  const brands = await q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]);
  return (
    <>
      <Link href="/app/studio" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Студия</Link>
      <PageHead title={t.title} sub={`${t.desc} Агент: ${t.agent}.`} />
      <ToolRunner tool={t.key} fields={t.fields.map((f) => ({ ...f }))} brands={brands} priceLabel={t.priceLabel} free={c.org.unlimited} kind={t.kind} />
    </>
  );
}
