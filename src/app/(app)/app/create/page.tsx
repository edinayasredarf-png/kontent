import { requirePageFeature } from "@/lib/plan-catalog";
import { orgPlan } from "@/lib/plan-catalog";
import { effectiveModel } from "@/lib/ai";
import { DraftHost } from "@/components/DraftHost";
import { ItemModal } from "@/components/ItemModal";
import Link from "next/link";
import { pageCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PRICES, ensurePrices } from "@/lib/wallet";
import { priceOf } from "@/lib/pipeline";
import { KINDS } from "@/lib/plan";
import { imageModels, textModels } from "@/lib/creator/models";
import { brandLogoState, listPresets, recentWorks } from "@/lib/creator/data";
import { exampleRefs, listExamples } from "@/lib/creator/examples";
import { CreateStudio } from "@/components/creator/CreateStudio";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export default async function Create({ searchParams }: { searchParams: Promise<{ type?: string; factory?: string; item?: string; draft?: string; err?: string; note?: string }> }) {
  const sp = await searchParams;
  const c = await pageCtx("write");
  await requirePageFeature(c.org.id, "create");
  sp.item = sp.item || sp.draft;
  if (sp.item && /^[0-9a-f-]{36}$/.test(sp.item)) {
    const [existing] = await q<{ draft: boolean; topic: string }>("select coalesce((meta->>'draft')::boolean,false) draft,topic from kz_content_items where org_id=$1 and id=$2", [c.org.id, sp.item]);
    if (!existing) return <p role="alert">Материал не найден или недоступен.</p>;
    return <>
    <h1 className="mb-6 text-xl font-medium">Доработка материала</h1>
    <p className="text-sm text-ink2">Редактируется исходный материал: изменения сохраняются в календаре, чате и контент-плане.</p>
    <Link href="/app/create" className="btn btn-ghost mt-4">Создать новый материал</Link>
    {existing.draft ? <DraftHost orgId={c.org.id} ids={[sp.item]} returnTo="/app/create" err={sp.err} note={sp.note} free={c.org.unlimited} /> : <ItemModal orgId={c.org.id} id={sp.item} returnTo="/app/create" err={sp.err} note={sp.note} canWrite />}
  </>;
  }
  await ensurePrices();
  const [fs, models, presets, examples, recent, writingModels] = await Promise.all([
    q<{ id: string; name: string; brand_id: string; brand: string; audience: string; brief: unknown }>("select f.id,f.name,f.brand_id,b.name brand,b.audience,f.brief from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 order by f.created_at desc", [c.org.id]),
    imageModels(), listPresets(c.org.id), listExamples(), recentWorks(c.org.id), textModels(),
  ]);
  const activePlan = await orgPlan(c.org.id);
  const defaults = Object.fromEntries(await Promise.all(KINDS.map(async k => [k, await effectiveModel(["seo", "article", "guide", "email"].includes(k) ? "article" : k === "carousel" ? "carousel" : k === "reels" ? "reels" : "post")])));
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
    startFactory={fs.some((f) => f.id === sp.factory) ? sp.factory! : fs[0].id} startKind={start} textModels={writingModels} models={models} presets={presets} examples={exampleRefs(examples)} recent={recent} kindPrices={prices} balanceKop={c.org.balance_kop} unlimited={c.org.unlimited} unlimitedModels={activePlan.unlimitedModels} textDefaultModels={defaults} />;
}
