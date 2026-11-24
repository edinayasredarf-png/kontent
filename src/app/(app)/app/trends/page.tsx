import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { q, one } from "@/lib/db";
import { requirePageFeature } from "@/lib/plan-catalog";
import { ensurePrices, PRICES } from "@/lib/wallet";
import { Trends } from "@/components/trends/Trends";
import type { TrendFactory, TrendRun } from "@/lib/trends-data";
import { isSchemaError } from "@/lib/errors";
export const maxDuration = 120;
export default async function TrendsPage() {
  const c = await requireCtx();
  await requirePageFeature(c.org.id,"monitor");
  await ensurePrices();
  const factories = await q<TrendFactory>("select f.id,f.name,b.name brand,f.niche,f.product from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 and f.status='active' order by b.name,f.name",[c.org.id]);
  if (!factories.length) return <div className="card p-8"><h1 className="text-2xl font-semibold">Тренды</h1><p className="mt-3 text-ink2">Создайте завод и заполните бриф бренда: по нему подберём темы и идеи для вашей компании.</p><Link href="/app/factories/new" className="btn btn-accent mt-5">Создать завод</Link></div>;
  let latest: TrendRun | null = null;
  try { latest = await one<TrendRun>("select id,factory_id,query,days,result,created_at::text from kz_trend_runs where org_id=$1 and factory_id=any($2::uuid[]) order by created_at desc limit 1",[c.org.id,factories.map(f=>f.id)]); }
  catch(e) { if (!isSchemaError(e)) throw e; }
  return <Trends factories={factories} initial={latest} price={PRICES.digest} topicPrice={PRICES.idea} canWrite={c.org.role !== "viewer"} />;
}
