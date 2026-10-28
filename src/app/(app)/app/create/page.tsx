import Link from "next/link";
import { pageCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PRICES, ensurePrices } from "@/lib/wallet";
import { priceOf } from "@/lib/pipeline";
import { KINDS } from "@/lib/plan";
import { imageModels } from "@/lib/creator/models";
import { brandLogoState, listPresets, recentWorks } from "@/lib/creator/data";
import { exampleRefs, listExamples } from "@/lib/creator/examples";
import { CreateStudio } from "@/components/creator/CreateStudio";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export default async function Create({ searchParams }: { searchParams: Promise<{ type?: string; factory?: string }> }) {
  const sp = await searchParams;
  const c = await pageCtx("write");
  await ensurePrices();
  const [fs, models, presets, examples, recent] = await Promise.all([
    q<{ id: string; name: string; brand_id: string; brand: string; audience: string; brief: unknown }>("select f.id,f.name,f.brand_id,b.name brand,b.audience,f.brief from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 order by f.created_at desc", [c.org.id]),
    imageModels(), listPresets(c.org.id), listExamples(), recentWorks(c.org.id),
  ]);
  const logos = await brandLogoState(c.org.id, [...new Set(fs.map((f) => f.brand_id))]);
  if (!fs.length) return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <b className="text-lg">Сначала нужен завод</b>
      <p className="mt-2 text-sm text-ink2">Бренд, тон и аудитория берутся из завода, поэтому материалы получаются «в голосе» вашей компании.</p>
      <Link href="/app/factories/new" className="btn btn-accent mt-4 inline-flex">Создать завод</Link>
    </div>);
  const prices = Object.fromEntries(KINDS.map((k) => [k, k === "carousel" ? PRICES.carousel_slide : priceOf(k)]));
  const start = sp.type && (KINDS as readonly string[]).includes(sp.type) ? sp.type : "carousel";
  return <CreateStudio factories={fs.map((f) => ({ id: f.id, name: f.name, brandId: f.brand_id, brand: f.brand, audience: f.audience, hasLogo: !!logos[f.brand_id] }))}
    startFactory={fs.some((f) => f.id === sp.factory) ? sp.factory! : fs[0].id} startKind={start} models={models} presets={presets} examples={exampleRefs(examples)} recent={recent} kindPrices={prices} balanceKop={c.org.balance_kop} unlimited={c.org.unlimited} />;
}
