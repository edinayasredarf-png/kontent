import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { requirePageFeature } from "@/lib/plan-catalog";
import { uuidOrEmpty } from "@/lib/range";
import { ExternalPosts } from "@/components/ExternalPosts";
import { PageHead } from "@/components/ui";

export default async function Materials({ searchParams }: { searchParams: Promise<Record<string,string | undefined>> }) {
  const c = await requireCtx(); await requirePageFeature(c.org.id,"analytics");
  const sp = await searchParams;
  const date = (v?: string) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
  return <>
    <Link href="/app/analytics" className="mb-2 inline-flex items-center gap-2 text-sm text-ink2"><ArrowLeft size={16} />Аналитика</Link>
    <PageHead title="Материалы по ссылке" />
    <ExternalPosts orgId={c.org.id} from={date(sp.from)} to={date(sp.to)} brand={uuidOrEmpty(sp.brand)} channel={uuidOrEmpty(sp.channel)} format={sp.format ?? ""} full />
  </>;
}
