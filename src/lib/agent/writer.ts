import { one, q } from "../db";
import { aiEditText, isEditOp, type EditOp } from "../text-tools";
import { cleanHtml } from "../seo";
import { buildImage, buildItem } from "../pipeline";
import { createFromNews } from "../monitor/news";
import { reworkItemImage } from "../item-images";
import { LOGO_POSITIONS, type LogoPos } from "../images";
import { htmlTitle, htmlToText } from "../repurpose";
import { safeFetchText } from "../safefetch";
import { KIND } from "../kinds";

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
  const newsId = uuid(a.newsId), itemId = uuid(a.itemId), url = clip(a.url, 500), topic = clip(a.topic, 300);

  let src: { title: string; url: string; name: string; body: string } | null = null;
  let from = "";
  if (newsId) {
    const r = await createFromNews(orgId, newsId, fac.id, [kind], true, { draft: true, note });
    if (!r.ok) return { ok: false, text: r.error };
    return r.ids.length ? { ok: true, text: `Написал (${KIND[kind] ?? kind}, завод «${fac.name}»)${r.error ? `. Замечание: ${r.error}` : ""}`, itemIds: r.ids } : { ok: false, text: r.error ?? "Не получилось" };
  }
  if (itemId) {
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
