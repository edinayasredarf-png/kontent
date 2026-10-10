import sharp from "sharp";
import { one, q } from "../db";
import { loadAsset, saveAsset } from "../assets";
import { cleanKit } from "../images";
import { cleanSettings } from "../postsettings";
import { fixLayout } from "./layouts";
import { renderInfographic, type Infographic } from "./infographic";
import { renderCarousel, type CarouselStyle, type Slide } from "./render";

export const carouselAssets = (itemId: string) =>
  q<{ id: string; position: number }>("select id,position from kz_assets where item_id=$1 and position>=0 order by position", [itemId]);

/** Фон обложки от нейросети приводим к размеру слайда: кадрируем и сжимаем, чтобы в БД не лежал оригинал на несколько мегабайт. */
export async function prepCover(raw: Buffer, height: number): Promise<Buffer> {
  return sharp(raw, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1080, height, fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

export const slideHeight = (format: "portrait" | "square") => (format === "portrait" ? 1350 : 1080);

export function cleanSlides(raw: unknown): Slide[] {
  const arr = Array.isArray(raw) ? raw : [];
  const slides = arr.slice(0, 10).map((s) => ({ title: String((s as Slide)?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 90), body: String((s as Slide)?.body ?? "").replace(/\s+/g, " ").trim().slice(0, 320), layout: (s as Slide)?.layout })).filter((s) => s.title);
  // макет только у внутренних слайдов и только если текст ему подходит; иначе обычный (поле не сохраняем)
  return slides.map((s, i) => { const l = fixLayout(s.layout, s.title, s.body, i > 0 && i < slides.length - 1 && slides.length >= 3); return l === "text" ? { title: s.title, body: s.body } : { title: s.title, body: s.body, layout: l }; });
}

/**
 * Рисует слайды и заменяет ими прежние файлы материала. Новые сохраняются до удаления старых — при сбое (например, лимит хранилища)
 * прежняя карусель остаётся целой. cover: undefined — оставить текущий фон обложки, null — убрать, Buffer — новый.
 */
export async function renderForItem(orgId: string, itemId: string, slides: Slide[], style: CarouselStyle, cover?: Buffer | null): Promise<void> {
  const it = await one<{ brand_id: string; brief: unknown; brand: string; kit: unknown }>(
    `select i.brand_id,f.brief,b.name brand,b.kit from kz_content_items i join kz_brands b on b.id=i.brand_id left join kz_factories f on f.id=i.factory_id where i.id=$1 and i.org_id=$2`, [itemId, orgId]);
  if (!it) throw new Error("Материал не найден");
  const st = cleanSettings(it.brief), kit = cleanKit(it.kit);
  const logoRow = await one<{ id: string }>("select id from kz_assets where org_id=$1 and brand_id=$2 and kind='logo'", [orgId, it.brand_id]);
  const logo = logoRow ? (await loadAsset(orgId, logoRow.id))?.data ?? null : null;
  const oldCover = await one<{ id: string }>("select id from kz_assets where item_id=$1 and position=-1", [itemId]);
  let coverBuf: Buffer | null = null;
  if (cover === undefined) coverBuf = oldCover ? (await loadAsset(orgId, oldCover.id))?.data ?? null : null;
  else coverBuf = cover;

  const out = await renderCarousel({ slides, style, colors: kit.colors ?? [], brandName: it.brand, aspect: st.carouselFormat, logo, cover: coverBuf });
  const ids: string[] = [];
  try {
    for (let i = 0; i < out.length; i++) ids.push(await saveAsset(orgId, it.brand_id, "generated", `slide-${i + 1}.jpg`, out[i], "", { itemId, position: i }));
    let coverId: string | null = null;
    if (cover instanceof Buffer) coverId = await saveAsset(orgId, it.brand_id, "generated", "cover-bg.jpg", { data: cover, mime: "image/jpeg", width: 1080, height: slideHeight(st.carouselFormat) }, "", { itemId, position: -1 });
    const keep = [...ids, ...(coverId ? [coverId] : cover === undefined && oldCover ? [oldCover.id] : [])];
    await q("delete from kz_assets where item_id=$1 and org_id=$2 and id <> all($3::uuid[])", [itemId, orgId, keep]);
  } catch (e) {
    if (ids.length) await q("delete from kz_assets where id = any($1::uuid[]) and org_id=$2", [ids, orgId]); // откатываем недозаписанное
    throw e;
  }
  await q("update kz_content_items set meta = meta || jsonb_build_object('carousel', jsonb_build_object('slides',$3::jsonb,'style',$4::text)), updated_at=now() where id=$1 and org_id=$2", [itemId, orgId, JSON.stringify(slides), style]);
}

/** Инфографика материала: один файл (position 0), прежний удаляется после сохранения нового. Параметры хранятся в meta.infographic для правки. */
export async function renderInfographicForItem(orgId: string, itemId: string, info: Infographic, style: CarouselStyle): Promise<void> {
  const it = await one<{ brand_id: string; brand: string; kit: unknown }>(
    "select i.brand_id,b.name brand,b.kit from kz_content_items i join kz_brands b on b.id=i.brand_id where i.id=$1 and i.org_id=$2", [itemId, orgId]);
  if (!it) throw new Error("Материал не найден");
  const kit = cleanKit(it.kit);
  const logoRow = await one<{ id: string }>("select id from kz_assets where org_id=$1 and brand_id=$2 and kind='logo'", [orgId, it.brand_id]);
  const logo = logoRow ? (await loadAsset(orgId, logoRow.id))?.data ?? null : null;
  const out = await renderInfographic({ info, style, colors: kit.colors ?? [], brandName: it.brand, logo });
  const id = await saveAsset(orgId, it.brand_id, "generated", "infographic.jpg", out, "", { itemId, position: 0 });
  await q("delete from kz_assets where item_id=$1 and org_id=$2 and id <> $3", [itemId, orgId, id]);
  await q("update kz_content_items set meta = meta || jsonb_build_object('infographic', $3::jsonb, 'infographicStyle', $4::text), updated_at=now() where id=$1 and org_id=$2", [itemId, orgId, JSON.stringify(info), style]);
}
