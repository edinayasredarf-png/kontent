"use server";
import { revalidatePath } from "next/cache";
import { requireWriter } from "../auth";
import { one, q } from "../db";
import { aiReady } from "../ai";
import { charge, refund, InsufficientFunds, rub } from "../wallet";
import { cleanKit, generateImage, LOGO_POSITIONS, rawCopy, type LogoPos } from "../images";
import { loadAsset, saveAsset } from "../assets";
import { applyCreateOverrides, brandOf, buildItem, loadFactory, type FactoryRow } from "../pipeline";
import { KINDS } from "../plan";
import { POST_TYPES } from "../postsettings";
import { STYLES } from "../studio-catalog";
import { describeImage } from "../images";
import { processImage } from "../assets";
import { briefMaterial } from "./brief";
import type { Brief, CreateOpts } from "./consts";
import { composePhotoSlide } from "../carousel/photo";
import { imageModels, isQuality, QUALITY, slidePrice, FORMATS, type FormatKey, type QualityKey } from "./models";
import { planCarousel, slidePrompt, sourceFrom, type CarouselPlan, type PlanSlide } from "./plan";

/** Настройки одной сессии студии. Хранятся и в пресете. */
export interface StudioSettings {
  model: string; quality: QualityKey; format: FormatKey; n: number;
  /** true — текст рисует нейросеть, false — набираем сами (ровная кириллица) */ textInImage: boolean;
  logo: boolean; logoPos: LogoPos; style: string; structure: string;
}
type Err = { ok: false; error: string };

const lastPlan = new Map<string, number>();
const slideErr = (e: unknown) => ((e as Error).message || "сбой").slice(0, 180);

function cleanStudio(raw: Partial<StudioSettings>, models: { id: string }[]): StudioSettings | null {
  const model = models.find((m) => m.id === raw.model)?.id;
  if (!model) return null;
  return {
    model, quality: isQuality(raw.quality) ? raw.quality : "1k", format: raw.format && raw.format in FORMATS ? raw.format : "portrait",
    n: Math.min(10, Math.max(3, Math.round(Number(raw.n) || 5))), textInImage: !!raw.textInImage, logo: !!raw.logo,
    logoPos: (LOGO_POSITIONS as readonly string[]).includes(String(raw.logoPos)) ? (raw.logoPos as LogoPos) : "br",
    style: String(raw.style ?? "").slice(0, 500), structure: String(raw.structure ?? "").slice(0, 600),
  };
}

/** Шаг 1: ИИ раскладывает запрос на слайды и придумывает для каждого свою сцену. Бесплатно: деньги берём за картинки. */
export async function planCarouselAction(factoryId: string, prompt: string, raw: Partial<StudioSettings>, opts?: Partial<CreateOpts>): Promise<{ ok: true; plan: CarouselPlan } | Err> {
  const c = await requireWriter();
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен" };
  const p = String(prompt ?? "").trim();
  if (p.length < 8) return { ok: false, error: "Опишите тему карусели хотя бы в одном предложении" };
  const now = Date.now();
  if (now - (lastPlan.get(c.user.id) ?? 0) < 4000) return { ok: false, error: "Подождите пару секунд и нажмите ещё раз" };
  lastPlan.set(c.user.id, now);
  const fac = await loadFactory(c.org.id, factoryId);
  if (!fac) return { ok: false, error: "Выберите завод: из него берутся бренд, тон и аудитория" };
  const st = cleanStudio(raw, await imageModels());
  const o = cleanOpts(opts);
  applyCreateOverrides(fac, { audience: o.audience });
  try { return { ok: true, plan: await planCarousel({ brand: brandOf(fac, p), product: fac.product, niche: fac.niche, prompt: p, n: st?.n ?? 5, style: st?.style, structure: st?.structure, postType: o.postType, voice: o.voice }) }; }
  catch (e) { return { ok: false, error: slideErr(e) }; }
}

/** Выбор клиента из панели: только известные ключи, длины ограничены. */
function cleanOpts(raw: Partial<CreateOpts> | undefined): CreateOpts {
  const t = String(raw?.postType ?? ""), v = String(raw?.voice ?? "");
  return { postType: t in POST_TYPES ? t : "", voice: v in STYLES && v !== "normal" ? v : "", audience: String(raw?.audience ?? "").replace(/\s+/g, " ").trim().slice(0, 400) };
}
const cleanRef = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 900);

/** Логотип бренда и набор для рендера: логотип можно выключить или переставить без перегенерации картинок. */
async function brandAssets(orgId: string, brandId: string, kitRaw: unknown, st: StudioSettings) {
  const kit = cleanKit(kitRaw);
  kit.logoPos = st.logo ? (st.logoPos || "br") : "none";
  const row = await one<{ id: string }>("select id from kz_assets where org_id=$1 and brand_id=$2 and kind='logo'", [orgId, brandId]);
  return { kit, logo: st.logo && row ? await loadAsset(orgId, row.id) : null, hasLogo: !!row };
}

export interface SlideDone { ok: true; finalId: string; bgId: string }

/**
 * Шаг 2: один слайд. Списание заранее, при любом сбое возврат. Картинка модели сохраняется отдельно (bgId): текст и логотип
 * потом меняются бесплатно, без повторной генерации.
 */
export async function generateSlideAction(factoryId: string, index: number, total: number, slide: PlanSlide, style: string, raw: Partial<StudioSettings>): Promise<SlideDone | Err> {
  const c = await requireWriter();
  const models = await imageModels(), st = cleanStudio(raw, models);
  if (!st) return { ok: false, error: "Эта модель сейчас недоступна, выберите другую" };
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен" };
  const fac = await loadFactory(c.org.id, factoryId);
  if (!fac) return { ok: false, error: "Завод не найден" };
  const title = String(slide?.title ?? "").slice(0, 90), body = String(slide?.body ?? "").slice(0, 320), visual = String(slide?.visual ?? "").slice(0, 600);
  if (!title || !visual) return { ok: false, error: "У слайда нет заголовка или описания картинки" };
  const model = models.find((m) => m.id === st.model)!, cost = slidePrice(model, st.quality);
  try { await charge(c.org.id, cost, `Слайд ${index + 1} карусели (${model.label}, ${QUALITY[st.quality].label})`, factoryId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: `Недостаточно средств: слайд стоит ${rub(cost)}` }; throw e; }
  try {
    const kit = cleanKit(fac.kit), palette = (kit.colors ?? []).map((x) => x.hex).join(", ");
    const textInImage = st.textInImage && model.text;
    const prompt = slidePrompt({ style: String(style ?? "").slice(0, 600), visual, title, body, aspect: st.format, textInImage, palette, must: kit.imageMust, never: kit.imageNever });
    const raw = await generateImage(prompt, st.format === "portrait" ? "portrait" : "square", { model: model.id, quality: QUALITY[st.quality].api });
    const { kit: k2, logo } = await brandAssets(c.org.id, fac.brand_id, fac.kit, st);
    const out = await composePhotoSlide({ bg: raw, title, body, index, total, brandName: fac.brand_name, format: st.format, width: QUALITY[st.quality].width, kit: k2, logo, overlay: !textInImage });
    const bgId = await saveAsset(c.org.id, fac.brand_id, "studio", `slide-${index + 1}-bg.jpg`, await rawCopy(raw), `${prompt}`.slice(0, 1000));
    const finalId = await saveAsset(c.org.id, fac.brand_id, "studio", `slide-${index + 1}.jpg`, out, "");
    return { ok: true, finalId, bgId };
  } catch (e) {
    await refund(c.org.id, cost, "ошибка слайда карусели", factoryId);
    return { ok: false, error: `Не получилось, деньги за слайд возвращены: ${slideErr(e)}` };
  }
}

/** Бесплатная пересборка слайда по сохранённой картинке: правка текста, включение или перенос логотипа. */
export async function recomposeSlideAction(factoryId: string, bgId: string, index: number, total: number, slide: { title: string; body: string }, raw: Partial<StudioSettings>, textInImage: boolean): Promise<{ ok: true; finalId: string } | Err> {
  const c = await requireWriter();
  const st = cleanStudio(raw, await imageModels());
  if (!st) return { ok: false, error: "Модель недоступна" };
  const fac = await loadFactory(c.org.id, factoryId);
  const bg = await loadAsset(c.org.id, String(bgId));
  if (!fac || !bg) return { ok: false, error: "Исходная картинка слайда не найдена" };
  try {
    const { kit, logo } = await brandAssets(c.org.id, fac.brand_id, fac.kit, st);
    const out = await composePhotoSlide({ bg: bg.data, title: String(slide.title).slice(0, 90), body: String(slide.body).slice(0, 320), index, total, brandName: fac.brand_name, format: st.format, width: QUALITY[st.quality].width, kit, logo, overlay: !textInImage });
    return { ok: true, finalId: await saveAsset(c.org.id, fac.brand_id, "studio", `slide-${index + 1}.jpg`, out, "") };
  } catch (e) { return { ok: false, error: slideErr(e) }; }
}

/** Освободить место: убираем файлы слайдов, которые заменены новыми (при перегенерации). */
export async function dropStudioAssetsAction(ids: string[]) {
  const c = await requireWriter();
  const list = (Array.isArray(ids) ? ids : []).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 40);
  if (list.length) await q("delete from kz_assets where org_id=$1 and kind='studio' and item_id is null and id = any($2::uuid[])", [c.org.id, list]);
}

export interface WorkInput { factoryId: string; topic: string; caption: string; slides: { title: string; body: string; visual: string }[]; finalIds: string[]; bgIds: string[]; style: string; settings: Partial<StudioSettings> }

/**
 * Шаг 3: готовая карусель становится материалом завода (черновик). Дальше работают обычные «В публикации», календарь и экспорт.
 * Картинки без текста лежат рядом с отрицательной позицией: слайды экспорта и публикации их не видят.
 */
export async function saveWorkAction(w: WorkInput): Promise<{ ok: true; id: string; factoryId: string } | Err> {
  const c = await requireWriter();
  const st = cleanStudio(w.settings, await imageModels());
  const fac = await loadFactory(c.org.id, String(w.factoryId));
  if (!fac || !st) return { ok: false, error: "Завод или модель не найдены" };
  const ok = (a: unknown) => Array.isArray(a) && a.every((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
  if (!ok(w.finalIds) || !ok(w.bgIds) || w.finalIds.length < 2 || w.finalIds.length !== w.bgIds.length || w.finalIds.length > 10) return { ok: false, error: "Нужно минимум два готовых слайда" };
  const slides = w.slides.slice(0, w.finalIds.length).map((s) => ({ title: String(s.title).slice(0, 90), body: String(s.body).slice(0, 320), visual: String(s.visual).slice(0, 600) }));
  const topic = String(w.topic || slides[0]?.title).replace(/\s+/g, " ").trim().slice(0, 140);
  const meta = { draft: true, carousel: { slides: slides.map(({ title, body }) => ({ title, body })), style: "photo", custom: [], design: {}, photo: { visuals: slides.map((s) => s.visual), style: String(w.style).slice(0, 600), settings: st } } };
  const it = await one<{ id: string }>(
    `insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,body,meta,status,cost_kop) values($1,$2,$3,'carousel',$4,$5,$6,$7::jsonb,'ready',0) returning id`,
    [c.org.id, fac.id, fac.brand_id, topic, slides[0]?.body ?? "", String(w.caption ?? "").slice(0, 4000), JSON.stringify(meta)]);
  const id = it!.id;
  const own = await q<{ id: string }>("select id from kz_assets where org_id=$1 and id = any($2::uuid[]) and kind='studio'", [c.org.id, [...w.finalIds, ...w.bgIds]]);
  if (own.length !== w.finalIds.length + w.bgIds.length) { await q("delete from kz_content_items where id=$1", [id]); return { ok: false, error: "Файлы слайдов не найдены" }; }
  for (let i = 0; i < w.finalIds.length; i++) {
    await q("update kz_assets set item_id=$2, position=$3, kind='generated' where id=$1 and org_id=$4", [w.finalIds[i], id, i, c.org.id]);
    await q("update kz_assets set item_id=$2, position=$3, kind='generated' where id=$1 and org_id=$4", [w.bgIds[i], id, -(10 + i), c.org.id]);
  }
  revalidatePath("/app", "layout");
  return { ok: true, id, factoryId: fac.id };
}

/* ───────── пресеты ───────── */

export async function savePresetAction(name: string, raw: Partial<StudioSettings>, style: string, sampleAssetId: string | null, brandId: string | null): Promise<{ ok: true; id: string } | Err> {
  const c = await requireWriter();
  const st = cleanStudio({ ...raw, style }, await imageModels());
  const nm = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!st) return { ok: false, error: "Модель недоступна" };
  if (nm.length < 2) return { ok: false, error: "Дайте пресету название" };
  if (!st.style) return { ok: false, error: "Стиль серии ещё не определён: создайте хотя бы один слайд" };
  try {
    const n = Number((await one<{ n: string }>("select count(*) n from kz_creator_presets where org_id=$1", [c.org.id]))?.n ?? 0);
    if (n >= 40) return { ok: false, error: "Не больше 40 пресетов: удалите ненужные" };
    const sample = sampleAssetId && /^[0-9a-f-]{36}$/i.test(sampleAssetId) && (await one("select 1 from kz_assets where id=$1 and org_id=$2", [sampleAssetId, c.org.id])) ? sampleAssetId : null;
    const r = await one<{ id: string }>("insert into kz_creator_presets(org_id,brand_id,name,settings,sample_asset_id,created_by) values($1,$2,$3,$4::jsonb,$5,$6) returning id",
      [c.org.id, brandId && /^[0-9a-f-]{36}$/i.test(brandId) ? brandId : null, nm, JSON.stringify(st), sample, c.user.id]);
    return { ok: true, id: r!.id };
  } catch (e) { return { ok: false, error: /kz_creator_presets/.test((e as Error).message) ? "Пресеты ещё не включены: администратору нужно применить миграцию 035 в базе" : slideErr(e) }; }
}

export async function deletePresetAction(id: string) {
  const c = await requireWriter();
  await q("delete from kz_creator_presets where id=$1 and org_id=$2", [String(id), c.org.id]);
}


/* ───────── текстовые материалы ───────── */

const okFactory = async (orgId: string, id: string): Promise<FactoryRow | null> => (/^[0-9a-f-]{36}$/i.test(String(id)) ? loadFactory(orgId, String(id)) : null);

/** «Саммари» до запуска для любого типа, кроме карусели (у неё оно приходит вместе с планом). Бесплатно. */
export async function briefAction(factoryId: string, kind: string, prompt: string, opts?: Partial<CreateOpts>, refText?: string): Promise<{ ok: true; brief: Brief } | Err> {
  const c = await requireWriter();
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен" };
  const p = String(prompt ?? "").trim();
  if (p.length < 3) return { ok: false, error: "Опишите тему хотя бы парой слов" };
  if (!(KINDS as readonly string[]).includes(kind)) return { ok: false, error: "Неизвестный тип материала" };
  const now = Date.now();
  if (now - (lastPlan.get(c.user.id) ?? 0) < 4000) return { ok: false, error: "Подождите пару секунд и нажмите ещё раз" };
  lastPlan.set(c.user.id, now);
  const fac = await okFactory(c.org.id, factoryId);
  if (!fac) return { ok: false, error: "Выберите завод: из него берутся бренд, тон и аудитория" };
  const o = cleanOpts(opts);
  applyCreateOverrides(fac, { audience: o.audience });
  try { return { ok: true, brief: await briefMaterial({ brand: brandOf(fac, p), product: fac.product, niche: fac.niche, kind, prompt: p, postType: o.postType, voice: o.voice, refText: cleanRef(refText) }) }; }
  catch (e) { return { ok: false, error: slideErr(e) }; }
}

export interface MadeItem { ok: true; id: string; factoryId: string; kind: string; title: string; body: string }

/** Создать один материал (не карусель): запись → общий конвейер buildItem (списание, генерация, возврат при сбое). Результат сразу показываем в панели. */
export async function createMaterialAction(i: { factoryId: string; kind: string; prompt: string; angle?: string; opts?: Partial<CreateOpts>; refText?: string }): Promise<MadeItem | Err> {
  const c = await requireWriter();
  const kind = String(i.kind);
  if (!(KINDS as readonly string[]).includes(kind) || kind === "carousel") return { ok: false, error: "Этот тип создаётся другим способом" };
  const fac = await okFactory(c.org.id, i.factoryId);
  if (!fac) return { ok: false, error: "Завод не найден" };
  const full = String(i.prompt ?? "").trim().slice(0, 20000);
  if (full.length < 3) return { ok: false, error: "Введите тему, идею или текст (минимум 3 символа)" };
  const o = cleanOpts(i.opts), ref = cleanRef(i.refText);
  const longText = full.length > 300;
  const topic = (longText ? full.split(/\n/)[0].trim() : full).slice(0, 120) || full.slice(0, 120);
  let source: { title: string; body: string; url: string } | null = longText ? { title: topic, body: full.slice(0, 12000), url: "" } : null;
  if (!source) { const s = await sourceFrom(full); if (s) source = { title: topic, body: s.text, url: s.url }; }
  const meta = { manual: true, draft: true, creator: true, ...(o.postType ? { postType: o.postType } : {}), ...(o.voice ? { voice: o.voice } : {}), ...(o.audience ? { audience: o.audience } : {}), ...(ref ? { refText: ref } : {}), ...(source ? { source } : {}) };
  const row = await one<{ id: string }>("insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,planned_for,status,meta) values($1,$2,$3,$4,$5,$6,null,'approved',$7::jsonb) returning id",
    [c.org.id, fac.id, fac.brand_id, kind, topic, String(i.angle ?? "").slice(0, 300), JSON.stringify(meta)]);
  const id = row!.id;
  const r = await buildItem(c.org.id, id);
  if (!r.ok) {
    await q("delete from kz_content_items where id=$1 and org_id=$2 and status in ('approved','failed','generating')", [id, c.org.id]);
    return { ok: false, error: r.error };
  }
  revalidatePath("/app", "layout");
  const it = await one<{ topic: string; body: string }>("select topic,body from kz_content_items where id=$1 and org_id=$2", [id, c.org.id]);
  return { ok: true, id, factoryId: fac.id, kind, title: it?.topic ?? topic, body: String(it?.body ?? "").slice(0, 12000) };
}

/* ───────── референсы ───────── */

/** Свой снимок как референс: сохраняем, ИИ «смотрит» и описывает стиль. Описание дальше идёт в план и в запрос к художнику. */
export async function describeRefAction(factoryId: string, fd: FormData): Promise<{ ok: true; id: string; visual: string } | Err> {
  const c = await requireWriter();
  const f = fd.get("file");
  if (!(f instanceof File) || !f.size) return { ok: false, error: "Выберите картинку" };
  if (f.size > 8 * 1024 * 1024) return { ok: false, error: "Файл больше 8 МБ" };
  const now = Date.now();
  if (now - (lastPlan.get(c.user.id) ?? 0) < 2500) return { ok: false, error: "Подождите пару секунд и повторите" };
  lastPlan.set(c.user.id, now);
  const fac = await okFactory(c.org.id, factoryId);
  if (!fac) return { ok: false, error: "Завод не найден" };
  try {
    const p = await processImage(Buffer.from(await f.arrayBuffer()), "studio");
    const visual = await describeImage({ data: p.data, mime: p.mime }, "reference");
    const id = await saveAsset(c.org.id, fac.brand_id, "studio", "reference.jpg", p, "reference");
    return { ok: true, id, visual };
  } catch (e) { return { ok: false, error: slideErr(e) }; }
}

/** Пресет не-карусельного материала: тип, тон, манера, аудитория и референс подачи. */
export async function saveTextPresetAction(name: string, kind: string, opts: Partial<CreateOpts>, refText: string, brandId: string | null): Promise<{ ok: true; id: string } | Err> {
  const c = await requireWriter();
  const nm = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (nm.length < 2) return { ok: false, error: "Дайте пресету название" };
  if (!(KINDS as readonly string[]).includes(kind)) return { ok: false, error: "Неизвестный тип" };
  try {
    const n = Number((await one<{ n: string }>("select count(*) n from kz_creator_presets where org_id=$1", [c.org.id]))?.n ?? 0);
    if (n >= 40) return { ok: false, error: "Не больше 40 пресетов: удалите ненужные" };
    const r = await one<{ id: string }>("insert into kz_creator_presets(org_id,brand_id,kind,name,settings,created_by) values($1,$2,$3,$4,$5::jsonb,$6) returning id",
      [c.org.id, brandId && /^[0-9a-f-]{36}$/i.test(brandId) ? brandId : null, kind, nm, JSON.stringify({ opts: cleanOpts(opts), refText: cleanRef(refText) }), c.user.id]);
    return { ok: true, id: r!.id };
  } catch (e) { return { ok: false, error: /kz_creator_presets/.test((e as Error).message) ? "Пресеты ещё не включены: администратору нужно применить миграцию 035 в базе" : slideErr(e) }; }
}
