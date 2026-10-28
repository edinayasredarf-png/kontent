import Link from "next/link";
import { pageCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { imageModels } from "@/lib/creator/models";
import { brandLogoState, listPresets } from "@/lib/creator/data";
import { CarouselStudio } from "@/components/creator/CarouselStudio";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export default async function CreateCarousel() {
  const c = await pageCtx("write");
  const [fs, models, presets] = await Promise.all([
    q<{ id: string; name: string; brand_id: string; brand: string }>("select f.id,f.name,f.brand_id,b.name brand from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 order by f.created_at desc", [c.org.id]),
    imageModels(), listPresets(c.org.id),
  ]);
  const logos = await brandLogoState(c.org.id, [...new Set(fs.map((f) => f.brand_id))]);
  if (!fs.length) return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <b className="text-lg">Сначала нужен завод</b>
      <p className="mt-2 text-sm text-ink2">Бренд, тон и аудитория берутся из завода, поэтому карусель получается «в голосе» вашей компании.</p>
      <Link href="/app/factories/new" className="btn btn-accent mt-4 inline-flex">Создать завод</Link>
    </div>);
  return <CarouselStudio factories={fs.map((f) => ({ id: f.id, name: f.name, brandId: f.brand_id, brand: f.brand, hasLogo: !!logos[f.brand_id] }))} models={models} presets={presets} balanceKop={c.org.balance_kop} unlimited={c.org.unlimited} />;
}
