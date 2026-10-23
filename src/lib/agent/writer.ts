import { one, q } from "../db";
import { aiEditText, isEditOp, type EditOp } from "../text-tools";
import { cleanHtml } from "../seo";
import { buildImage, buildItem, reapplyLogo } from "../pipeline";
import { createFromNews } from "../monitor/news";
import { reworkItemImage } from "../item-images";
import { LOGO_POSITIONS, type LogoPos } from "../images";
import { htmlTitle, htmlToText } from "../repurpose";
import { safeFetchText } from "../safefetch";
import { KIND } from "../kinds";
import { sectionImage } from "../article-images";
import { H2 } from "../article-lib";
import { copyAssetToItem } from "../item-images";
import { loadAsset, saveAsset, processImage } from "../assets";

/** Письменные действия ассистента: написать материал, переписать, поменять картинку. Выполняются по прямой просьбе пользователя. */
export interface ActResult { ok: boolean; text: string; itemIds?: string[] }
type Args = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : "");
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");

/** Какие форматы умеет писать чат. Слова пользователя («статья», «seo») модель сводит к этим ключам, но подстрахуемся. */
export const WRITE_KINDS = ["post", "article", "seo", "carousel", "story"] as const;
export function normKind(v: unknown): string {
  const k = String(v ?? "post").toLowerCase().trim();
  if ((WRITE_KINDS as readonly string[]).includes(k)) return k;
  if (/seo|сео/.test(k)) return "seo";
  if (/лонгрид|статья|article|блог/.test(k)) return "article";
  if (/карусел/.test(k)) return "carousel";
  if (/сторис|stories|story/.test(k)) return "story";
  return "post";
}

/** Завод для материала: указанный, иначе единственный активный, иначе тот, где недавно работали. */
async function pickFactory(orgId: string, want: unknown): Promise<{ id: string; brand_id: string; name: string } | null> {
  const id = uuid(want);
  if (id) { const f = await one<{ id: string; brand_id: string; name: string }>("select id,brand_id,name from kz_factories where id=$1 and org_id=$2", [id, orgId]); if (f) return f; }
  const list = await q<{ id: string; brand_id: string; name: string }>(
    `select f.id,f.brand_id,f.name from kz_factories f where f.org_id=$1 and f.status='active'
      order by (select max(created_at) from kz_content_items i where i.factory_id=f.id) desc nulls last, f.created_at limit 2`, [orgId]);
  return list[0] ?? null;
}

const factoryNames = async (orgId: string) => (await q<{ name: string }>("select name from kz_factories where org_id=$1 and status='active' order by name", [orgId])).map((f) => f.name).join(", ");

/** Текст страницы по ссылке: то, что человек прислал в чат. Закрытые и скриптовые страницы честно отклоняем. */
export async function articleFromUrl(url: string): Promise<{ ok: true; title: string; text: string } | { ok: false; error: string }> {
  try {
    const page = await safeFetchText(url, { maxBytes: 3_000_000 });
    const html = /<(html|body|p|div|article)\b/i.test(page.text);
    const text = (html ? htmlToText(page.text) : page.text.trim()).slice(0, 12_000);
    if (text.length < 400) return { ok: false, error: "На странице почти нет текста: возможно, она закрыта или собирается скриптами. Вставьте текст сюда или другую ссылку" };
    return { ok: true, title: (html ? htmlTitle(page.text) : "") || text.slice(0, 80), text };
  } catch (e) { return { ok: false, error: `Не удалось открыть ссылку: ${(e as Error).message.slice(0, 120)}` }; }
}

/** Написать материал по новости из ленты, по ссылке, по теме или заново в другом формате из уже созданного материала. Результат — черновик, который чат показывает целиком. */
export async function writeMaterial(orgId: string, a: Args): Promise<ActResult> {
  const kind = normKind(a.kind), note = clip(a.instructions, 600);
  const fac = await pickFactory(orgId, a.factoryId);
  if (!fac) return { ok: false, text: "Не нашёл завод, для которого писать. Создайте завод в разделе «Заводы»" };
  const newsId = uuid(a.newsId), itemId = uuid(a.itemId), url = clip(a.url, 500), topic = clip(a.topic, 300), fileId = uuid(a.fileId), picId = uuid(a.imageAssetId);

  let src: { title: string; url: string; name: string; body: string } | null = null;
  let from = "";
  if (newsId) {
    const r = await createFromNews(orgId, newsId, fac.id, [kind], true, { draft: true, note });
    if (!r.ok) return { ok: false, text: r.error };
    return r.ids.length ? { ok: true, text: `Написал (${KIND[kind] ?? kind}, завод «${fac.name}»)${r.error ? `. Замечание: ${r.error}` : ""}`, itemIds: r.ids } : { ok: false, text: r.error ?? "Не получилось" };
  }
  if (fileId) {
    const f = await loadAsset(orgId, fileId);
    if (!f || !f.mime.startsWith("text/")) return { ok: false, text: "Не нашёл прикреплённый документ" };
    const text = f.data.toString("utf8").slice(0, 12_000);
    src = { title: topic || f.name.replace(/\.[a-z0-9]+$/i, ""), url: "", name: f.name, body: text };
    from = "по прикреплённому документу";
  } else if (itemId) {
    const it = await one<{ topic: string; meta: { source?: { title: string; url: string; name: string; body: string } } | null; body: string }>("select topic,meta,body from kz_content_items where id=$1 and org_id=$2", [itemId, orgId]);
    if (!it) return { ok: false, text: "Исходный материал не найден" };
    src = it.meta?.source ? { ...it.meta.source, name: it.meta.source.name ?? "" } : { title: it.topic, url: "", name: "", body: it.body.slice(0, 8000) };
    from = "из предыдущего материала";
  } else if (/^https?:\/\//i.test(url)) {
    const r = await articleFromUrl(url);
    if (!r.ok) return { ok: false, text: r.error };
    src = { title: r.title, url, name: new URL(url).hostname, body: r.text };
    from = `по ссылке ${new URL(url).hostname}`;
  }
  if (!src && !topic) return { ok: false, text: "Не указан источник: новость, ссылка, тема или предыдущий материал" };

  const source = src ? { ...src, body: `${note ? `ЗАДАНИЕ ПО ПОДАЧЕ: ${note}\n\n` : ""}${src.body}`.slice(0, 9000) } : { title: topic, url: "", name: "", body: note ? `ЗАДАНИЕ ПО ПОДАЧЕ: ${note}` : "" };
  const [row] = await q<{ id: string }>(
    "insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,status,meta) values($1,$2,$3,$4,$5,'','approved',$6) returning id",
    [orgId, fac.id, fac.brand_id, kind, (src?.title || topic).slice(0, 300), JSON.stringify({ source, draft: true, ...(src ? { fromNews: true } : {}) })]);
  if (picId) await copyAssetToItem(orgId, picId, row.id).catch(() => false);
  const b = await buildItem(orgId, row.id);
  if (!b.ok) { await q("delete from kz_content_items where id=$1 and org_id=$2", [row.id, orgId]); return { ok: false, text: b.error ?? "Не получилось написать" }; }
  return { ok: true, text: `Написал (${KIND[kind] ?? kind}${from ? ", " + from : ""}, завод «${fac.name}»)`, itemIds: [row.id] };
}

/** Переписать текст материала: сократить, удлинить, поменять тон или выполнить произвольную просьбу. */
export async function rewriteMaterial(orgId: string, a: Args): Promise<ActResult> {
  const id = uuid(a.itemId);
  const it = id ? await one<{ kind: string; body: string; status: string }>("select kind,body,status from kz_content_items where id=$1 and org_id=$2", [id, orgId]) : null;
  if (!it) return { ok: false, text: "Не нашёл материал. Уточните, какой переписать" };
  if (it.status === "published") return { ok: false, text: "Материал уже опубликован: его нельзя изменить. Могу написать новую версию заново" };
  const opRaw = String(a.op ?? "custom"), ins = clip(a.instruction, 400);
  const op: EditOp = isEditOp(opRaw) ? opRaw : "custom";
  const r = await aiEditText(orgId, it.body, op, op === "custom" ? ins : "");
  if (!r.ok) return { ok: false, text: r.error };
  const body = ["seo", "email", "guide"].includes(it.kind) ? cleanHtml(r.text) : r.text.trim().slice(0, 20000);
  await q("update kz_content_items set body=$3, updated_at=now() where id=$1 and org_id=$2", [id, orgId, body]);
  return { ok: true, text: "Текст переписан", itemIds: [id] };
}

const ASPECT: Record<string, "square" | "portrait" | "landscape"> = { square: "square", portrait: "portrait", landscape: "landscape", вертикальный: "portrait", горизонтальный: "landscape", квадрат: "square" };

/** Картинка материала: создать, пересоздать по описанию, доработать, сменить формат или положение логотипа. */
export async function imageForMaterial(orgId: string, a: Args): Promise<ActResult> {
  const id = uuid(a.itemId);
  const it = id ? await one<{ status: string; meta: { imagePrompt?: string } | null; image_id: string | null }>("select status,meta,image_id from kz_content_items where id=$1 and org_id=$2", [id, orgId]) : null;
  if (!it) return { ok: false, text: "Не нашёл материал. Уточните, для какого нужна картинка" };
  if (it.status === "published") return { ok: false, text: "Материал уже опубликован: картинку не изменить" };
  const op = String(a.op ?? "new"), prompt = clip(a.prompt, 600);
  if (op === "use") {
    const asset = uuid(a.assetId) ? await loadAsset(orgId, uuid(a.assetId)) : null;
    if (!asset || asset.kind === "logo" || !asset.mime.startsWith("image/")) return { ok: false, text: "Не нашёл прикреплённую картинку" };
    return (await copyAssetToItem(orgId, id, uuid(a.itemId))) ? { ok: true, text: "Картинка из вложения поставлена в материал", itemIds: [id] } : { ok: false, text: "Не получилось поставить картинку" };
  }
  if (op === "article") {
    const row = await one<{ kind: string; body: string }>("select kind,body from kz_content_items where id=$1", [id]);
    if (!row || !["seo", "article", "guide"].includes(row.kind)) return { ok: false, text: "Картинки к разделам есть только у статей" };
    const heads = [...row.body.matchAll(H2)].length;
    if (!heads) return { ok: false, text: "В статье нет заголовков второго уровня: картинки ставятся после них" };
    const want = Math.min(heads, Math.min(4, Math.max(1, Math.round(Number(a.count)) || 3)));
    // равномерно по статье: первый, средние и последний разделы
    const idx = [...new Set(Array.from({ length: want }, (_, k) => Math.round((k * (heads - 1)) / Math.max(1, want - 1))))];
    const asp = ASPECT[String(a.aspect ?? "landscape").toLowerCase()] ?? "landscape";
    let made = 0, err = "";
    for (const h of idx) {
      const cur = (await one<{ body: string }>("select body from kz_content_items where id=$1", [id]))?.body ?? "";
      const r = await sectionImage(orgId, id, cur, h, prompt, asp, { logo: a.logo === true });
      if (r.ok) made++; else { err = r.error; break; }
    }
    return made ? { ok: true, text: `Картинок к разделам статьи: ${made}${err ? `. Остановился: ${err}` : ""}`, itemIds: [id] } : { ok: false, text: err || "Не получилось" };
  }
  if (op === "logo") {
    const lp = String(a.logoPos ?? ""), scale = Number(a.logoScale), margin = Number(a.logoMargin);
    const over: { logoPos?: LogoPos; logoScale?: number; logoMargin?: number } = {};
    if (lp === "none" || (LOGO_POSITIONS as readonly string[]).includes(lp)) over.logoPos = lp as LogoPos;
    if (scale > 0) over.logoScale = Math.min(40, Math.max(4, Math.round(scale)));
    if (margin > 0) over.logoMargin = Math.min(12, Math.max(1, Math.round(margin)));
    if (!Object.keys(over).length) return { ok: false, text: "Не понял, что менять в логотипе: положение, размер или отступ" };
    const r = await reapplyLogo(orgId, id, over);
    if (!r.ok) return { ok: false, text: r.needRegen ? `${r.error}. Могу создать картинку заново с нужным логотипом (платно, как новая картинка)` : r.error };
    if (a.forBrand === true) {
      const brand = await one<{ brand_id: string }>("select brand_id from kz_content_items where id=$1", [id]);
      if (brand) await q("update kz_brands set kit = coalesce(kit,'{}'::jsonb) || $3::jsonb where id=$1 and org_id=$2", [brand.brand_id, orgId, JSON.stringify({ ...(over.logoPos ? { logoPos: over.logoPos } : {}), ...(over.logoScale ? { logoScale: over.logoScale } : {}), ...(over.logoMargin ? { logoMargin: over.logoMargin } : {}) })]);
    }
    return { ok: true, text: `Логотип изменён${a.forBrand === true ? " и сохранён для бренда" : ""}`, itemIds: [id] };
  }
  if (op === "rework") {
    const r = await reworkItemImage(orgId, id, prompt);
    return r.ok ? { ok: true, text: "Изображение доработано", itemIds: [id] } : { ok: false, text: r.error };
  }
  const over: { aspect?: "square" | "portrait" | "landscape"; logoPos?: LogoPos } = {};
  const asp = ASPECT[String(a.aspect ?? "").toLowerCase()];
  if (asp) over.aspect = asp;
  const lp = String(a.logoPos ?? "");
  if (lp === "none" || (LOGO_POSITIONS as readonly string[]).includes(lp)) over.logoPos = lp as LogoPos;
  // формат и логотип меняем на том же сюжете: берём прежнее описание картинки; новая картинка — новое описание (или пусто — по теме материала)
  const base = op === "new" ? prompt : prompt || it.meta?.imagePrompt || "";
  const r = await buildImage(orgId, id, base || undefined, over);
  if (!r.ok) return { ok: false, text: r.error };
  const what = [asp ? `формат: ${{ square: "квадрат", portrait: "вертикальный", landscape: "горизонтальный" }[asp]}` : "", over.logoPos ? (over.logoPos === "none" ? "без логотипа" : "логотип перемещён") : ""].filter(Boolean).join(", ");
  return { ok: true, text: `Картинка ${op === "new" ? "создана" : "создана заново"}${what ? ` (${what})` : ""}`, itemIds: [id] };
}

export { factoryNames };

/** Прикреплённую картинку — логотипом бренда. Обрабатывается так же, как загрузка в «Брендбуке». */
export async function setLogoFromAttachment(orgId: string, a: Args): Promise<ActResult> {
  const asset = uuid(a.assetId) ? await loadAsset(orgId, uuid(a.assetId)) : null;
  if (!asset || !asset.mime.startsWith("image/")) return { ok: false, text: "Не нашёл прикреплённую картинку" };
  const bid = uuid(a.brandId) || (await one<{ id: string }>("select id from kz_brands where org_id=$1 order by created_at limit 1", [orgId]))?.id;
  if (!bid || !(await one("select 1 from kz_brands where id=$1 and org_id=$2", [bid, orgId]))) return { ok: false, text: "Не нашёл бренд" };
  try { await saveAsset(orgId, bid, "logo", "логотип", await processImage(asset.data, "logo"), "из чата"); } catch (e) { return { ok: false, text: (e as Error).message.slice(0, 160) }; }
  return { ok: true, text: "Логотип бренда обновлён" };
}
