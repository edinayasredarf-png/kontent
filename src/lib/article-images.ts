import { one, q } from "./db";
import { saveAsset } from "./assets";
import { buildImagePrompt, cleanKit, finalizeImage, generateImage, loadAsset, LOGO_POSITIONS, SIZES, STYLES } from "./images";
import { brandNotes } from "./pipeline";
import { cleanHtml } from "./seo";
import { charge, InsufficientFunds, PRICES, refund } from "./wallet";
import { aiReady } from "./ai";
import { H2, SECTION_ASPECTS, insertAfterH2 } from "./article-lib";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Картинка к одному разделу статьи (общая часть для кнопки в редакторе и для чата). Деньги списываются заранее и возвращаются при сбое. */
export async function sectionImage(orgId: string, itemId: string, html: string, h2Index: number, wish: string, aspect: string, o: { style?: string; logo?: boolean; pos?: string; scale?: number } = {}): Promise<{ ok: true; html: string; assetId: string } | { ok: false; error: string }> {
  const c = { org: { id: orgId } };
  const it = await one<{ brand_id: string; topic: string; kind: string; status: string; factory_id: string | null }>("select brand_id,topic,kind,status,factory_id from kz_content_items where id=$1 and org_id=$2", [itemId, c.org.id]);
  if (!it || !["seo", "article", "guide"].includes(it.kind)) return { ok: false, error: "Материал не найден" };
  if (!["idea", "approved", "ready", "failed"].includes(it.status)) return { ok: false, error: "Этот материал сейчас нельзя изменить" };
  const src = String(html ?? "");
  const heads = [...src.matchAll(H2)];
  if (!Number.isInteger(h2Index) || h2Index < 0 || h2Index >= heads.length) return { ok: false, error: "Раздел не найден: возможно, заголовки статьи изменились" };
  if (src.length > 200_000) return { ok: false, error: "Статья слишком большая" };
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен" };
  const asp = (aspect in SECTION_ASPECTS ? aspect : "landscape") as keyof typeof SIZES;
  const title = heads[h2Index][0].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  // текст раздела: от этого заголовка до следующего, чтобы картинка была про содержание
  const from = (heads[h2Index].index ?? 0) + heads[h2Index][0].length, to = heads[h2Index + 1]?.index ?? src.length;
  const section = src.slice(from, to).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  try { await charge(c.org.id, PRICES.image, `Картинка к разделу: ${title.slice(0, 50)}`, itemId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const brand = await one<{ name: string; kit: unknown }>("select name,kit from kz_brands where id=$1 and org_id=$2", [it.brand_id, c.org.id]);
    if (!brand) throw new Error("Бренд не найден");
    const kit = cleanKit(brand.kit);
    // единый стиль серии: выбранный, иначе стиль бренда, иначе иллюстрация; он же запоминается в материале для следующих запусков
    const style = o.style && o.style in STYLES ? o.style : kit.style && kit.style in STYLES ? kit.style : "illustration";
    const prompt = await buildImagePrompt({ brandName: brand.name, kit: { ...kit, style }, topic: title, hook: String(wish ?? "").slice(0, 300), body: section, notes: await brandNotes(c.org.id, it.brand_id), series: true });
    const raw = await generateImage(prompt, asp);
    let logo = null;
    if (o.logo) {
      const row = await one<{ id: string }>("select id from kz_assets where org_id=$1 and brand_id=$2 and kind='logo' order by created_at desc limit 1", [c.org.id, it.brand_id]);
      if (!row) throw new Error("логотип бренда не загружен: загрузите его в «Брендбуке» или снимите галочку");
      logo = await loadAsset(c.org.id, row.id);
    }
    const pos = (LOGO_POSITIONS as readonly string[]).includes(o.pos ?? "") ? (o.pos as (typeof LOGO_POSITIONS)[number]) : "br";
    const done = await finalizeImage(raw, logo, { ...kit, logoPos: logo ? pos : "none", logoScale: Math.min(40, Math.max(4, Math.round(Number(o.scale)) || kit.logoScale || 14)) });
    await q("update kz_content_items set meta = meta || jsonb_build_object('imgStyle',$3::text) where id=$1 and org_id=$2", [itemId, c.org.id, style]);
    const assetId = await saveAsset(c.org.id, it.brand_id, "generated", `${title.slice(0, 50)}.jpg`, done);
    const next = insertAfterH2(src, h2Index, `<figure><img src="/api/assets/${assetId}" alt="${esc(title)}"></figure>`);
    if (!next) throw new Error("не удалось вставить картинку в текст");
    const clean = cleanHtml(next);
    await q("update kz_content_items set body=$3, updated_at=now() where id=$1 and org_id=$2", [itemId, c.org.id, clean]);
    return { ok: true, html: clean, assetId };
  } catch (e) {
    await refund(c.org.id, PRICES.image, "ошибка картинки к разделу", itemId);
    return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message.slice(0, 160)}` };
  }
}
