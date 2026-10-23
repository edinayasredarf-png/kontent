import { one, q } from "../db";
import { aiReady, chat, extractArray } from "../ai";
import { InsufficientFunds, PRICES, charge, refund } from "../wallet";
import { allocateDates } from "../plan";
import { KIND } from "../kinds";
import { cleanHtml } from "../seo";
import { draftPublishNow, draftToPlan, loadDrafts, publishItemNow, publishReport, rescheduleItem, setItemChannels } from "../drafts";
import { editImage } from "../images";
import { copyAssetToItem } from "../item-images";
import { loadAsset, processImage, saveAsset } from "../assets";
import { snapshot } from "../versions";
import type { SetupResult } from "./setup";

type Args = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : "");
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");
const DRAFT = "coalesce((meta->>'draft')::boolean,false)";

const notFree = async (orgId: string, kop: number, reason: string, ref?: string): Promise<string | null> => {
  try { await charge(orgId, kop, reason, ref); return null; } catch (e) { if (e instanceof InsufficientFunds) return "Недостаточно средств на балансе"; throw e; }
};

/** Несколько вариантов заголовка, первой строки или всего поста: показываются карточкой, выбранный вариант применяется кнопкой. */
export async function makeVariants(orgId: string, a: Args): Promise<SetupResult> {
  const id = uuid(a.itemId);
  const it = id ? await one<{ kind: string; topic: string; body: string; status: string }>("select kind,topic,body,status from kz_content_items where id=$1 and org_id=$2", [id, orgId]) : null;
  if (!it) return { ok: false, text: "Не нашёл материал, для которого нужны варианты" };
  if (it.status === "published") return { ok: false, text: "Материал уже опубликован: варианты можно сделать только к неопубликованному" };
  const what = ["headline", "hook", "post"].includes(String(a.what)) ? String(a.what) : "headline";
  const count = Math.min(5, Math.max(2, Math.round(Number(a.count)) || 3));
  const ins = clip(a.instruction, 300);
  if (!aiReady()) return { ok: false, text: "AI Gateway не настроен" };
  const err = await notFree(orgId, PRICES.variants, "Варианты текста");
  if (err) return { ok: false, text: err };
  try {
    const goal = what === "post" ? `${count} разных вариантов ВСЕГО текста поста (тот же смысл и факты, разная подача)` : what === "hook" ? `${count} вариантов цепляющей ПЕРВОЙ СТРОКИ поста` : `${count} вариантов ЗАГОЛОВКА`;
    const raw = await chat("post", "Ты редактор контента. Отвечай только JSON-массивом строк на русском, без пояснений.",
      `Материал (${KIND[it.kind] ?? it.kind}), тема: ${it.topic}\n\nТекст:\n${it.body.replace(/<[^>]+>/g, " ").slice(0, 6000)}\n\nСделай ${goal}.${ins ? ` Пожелание: ${ins}.` : ""} Варианты должны заметно отличаться друг от друга.`,
      { maxTokens: what === "post" ? 3500 : 700, temperature: 0.9, timeoutMs: 60_000 });
    const arr = (extractArray(raw) ?? []).map((x) => String(x).trim()).filter((x) => x.length > 3).slice(0, count);
    if (arr.length < 2) throw new Error("модель вернула меньше двух вариантов");
    return { ok: true, text: `Подготовил вариантов: ${arr.length}`, refs: [{ t: "variants", itemId: id, what: what as "headline" | "hook" | "post", options: arr.map((x) => x.slice(0, 6000)) }] };
  } catch (e) { await refund(orgId, PRICES.variants, "ошибка вариантов текста"); return { ok: false, text: `Не получилось, деньги возвращены: ${(e as Error).message.slice(0, 120)}` }; }
}

/** Применить выбранный вариант. Для поста заменяется весь текст, для заголовка и первой строки — только начало. */
export async function applyVariant(orgId: string, itemId: string, what: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const it = await one<{ kind: string; body: string; status: string }>("select kind,body,status from kz_content_items where id=$1 and org_id=$2", [itemId, orgId]);
  if (!it) return { ok: false, error: "Материал не найден" };
  if (it.status === "published") return { ok: false, error: "Материал уже опубликован" };
  const t = text.trim().slice(0, 20_000);
  if (!t) return { ok: false, error: "Пустой вариант" };
  const html = ["seo", "email", "guide"].includes(it.kind);
  let body = it.body;
  if (what === "post") body = html ? cleanHtml(t.includes("<") ? t : `<p>${t.replace(/\n+/g, "</p><p>")}</p>`) : t;
  else if (html) body = /<h1\b/i.test(body) ? body.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i, (_m, o, c) => `${o}${t.replace(/[<>]/g, "")}${c}`) : `<h1>${t.replace(/[<>]/g, "")}</h1>\n${body}`;
  else { const nl = body.indexOf("\n"); body = nl < 0 ? t : `${t}${body.slice(nl)}`; }
  await snapshot(orgId, itemId, what === "post" ? "до замены варианта" : "до нового заголовка");
  await q("update kz_content_items set body=$3, updated_at=now() where id=$1 and org_id=$2", [itemId, orgId, body]);
  return { ok: true };
}

/** Поставить материал в контент-план на дату и время. Бесплатно. */
export async function scheduleMaterial(orgId: string, a: Args): Promise<SetupResult> {
  const id = uuid(a.itemId), date = clip(a.date, 10), time = /^\d{2}:\d{2}$/.test(clip(a.time, 5)) ? clip(a.time, 5) : "10:00";
  if (!id) return { ok: false, text: "Не нашёл материал" };
  const isDraft = !!(await one(`select 1 from kz_content_items where id=$1 and org_id=$2 and ${DRAFT}`, [id, orgId]));
  const r = isDraft ? await draftToPlan(orgId, id, date, time) : await rescheduleItem(orgId, id, date, time);
  return r.ok ? { ok: true, text: `Поставил в контент-план на ${date} в ${time}`, itemIds: [id] } : { ok: false, text: r.error };
}

/** Опубликовать материал сейчас в выбранные каналы (VK, Telegram, MAX… по названию или типу). Необратимо, поэтому только по прямой просьбе. */
export async function publishMaterial(orgId: string, a: Args): Promise<SetupResult> {
  const id = uuid(a.itemId);
  if (!id) return { ok: false, text: "Не нашёл материал" };
  const want = (Array.isArray(a.channels) ? a.channels : typeof a.channels === "string" ? [a.channels] : []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  if (want.length) {
    const d = (await loadDrafts(orgId, [id]))[0];
    const opts = d?.channels ?? (await q<{ id: string; title: string; kind: string }>("select id,title,kind from kz_channels where org_id=$1 and status='active'", [orgId]));
    const ids = opts.filter((c) => want.some((w) => c.kind === w || c.title.toLowerCase().includes(w) || (w === "вк" && c.kind === "vk") || (w === "телеграм" && c.kind === "telegram"))).map((c) => c.id);
    if (!ids.length) return { ok: false, text: `Не нашёл каналы «${want.join(", ")}» среди доступных для этого материала` };
    const s = await setItemChannels(orgId, id, ids);
    if (!s.ok) return { ok: false, text: s.error };
  }
  const isDraft = !!(await one(`select 1 from kz_content_items where id=$1 and org_id=$2 and ${DRAFT}`, [id, orgId]));
  const r = isDraft ? await draftPublishNow(orgId, id) : await publishItemNow(orgId, id);
  if (!r.ok) return { ok: false, text: r.error };
  const rep = await publishReport(orgId, id);
  return { ok: rep.ok, text: rep.ok ? rep.note ?? "Опубликовано" : rep.error ?? "Не опубликовалось", itemIds: [id] };
}

/** Серия: придумать N разных идей по теме и поставить их в контент-план завода (идеи ждут одобрения, если у завода ручное одобрение). */
export async function makeSeries(orgId: string, a: Args): Promise<SetupResult> {
  const topic = clip(a.topic, 300), n = Math.min(14, Math.max(2, Math.round(Number(a.days ?? a.count)) || 7));
  if (!topic) return { ok: false, text: "О чём серия? Назовите тему" };
  const fid = uuid(a.factoryId);
  const f = fid ? await one<{ id: string; brand_id: string; name: string; approval: string }>("select id,brand_id,name,approval from kz_factories where id=$1 and org_id=$2", [fid, orgId])
    : await one<{ id: string; brand_id: string; name: string; approval: string }>("select id,brand_id,name,approval from kz_factories where org_id=$1 and status='active' order by created_at limit 1", [orgId]);
  if (!f) return { ok: false, text: "Не нашёл завод для серии" };
  const kinds = (Array.isArray(a.kinds) ? a.kinds : ["post"]).map(String).filter((k) => ["post", "carousel", "story", "article", "seo"].includes(k));
  const kindList = kinds.length ? kinds : ["post"];
  if (!aiReady()) return { ok: false, text: "AI Gateway не настроен" };
  const cost = PRICES.plan_day * n;
  const err = await notFree(orgId, cost, `Контент-план: серия «${topic.slice(0, 40)}»`);
  if (err) return { ok: false, text: err };
  try {
    const brand = await one<{ name: string; description: string; audience: string; tone: string }>("select name,description,audience,tone from kz_brands where id=$1", [f.brand_id]);
    const raw = await chat("plan", "Ты контент-стратег. Отвечай только JSON-массивом объектов {\"topic\":\"тема поста\",\"hook\":\"угол или первая фраза\",\"kind\":\"post|carousel|story|article|seo\"} на русском.",
      `Бренд: ${brand?.name}. ${brand?.description ?? ""}\nАудитория: ${brand?.audience ?? ""}\nТон: ${brand?.tone ?? ""}\n\nТема серии: ${topic}\nСделай ровно ${n} РАЗНЫХ материалов, каждый со своим углом (польза, кейс, миф, вопрос-ответ, закулисье, цифры…), без повторов. Форматы: ${kindList.join(", ")}.${clip(a.instructions, 300) ? ` Пожелания: ${clip(a.instructions, 300)}.` : ""}`,
      { maxTokens: 2500, temperature: 0.8, timeoutMs: 60_000 });
    const ideas = (extractArray(raw) ?? []).map((x) => x as { topic?: unknown; hook?: unknown; kind?: unknown }).filter((x) => typeof x.topic === "string" && String(x.topic).trim()).slice(0, n);
    if (ideas.length < 2) throw new Error("модель не предложила идей");
    const dates = await allocateDates(f.id, ideas.length);
    for (let i = 0; i < ideas.length; i++) {
      const k = kindList.includes(String(ideas[i].kind)) ? String(ideas[i].kind) : kindList[0];
      await q("insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,planned_for,status,meta) values($1,$2,$3,$4,$5,$6,$7,$8,'{}'::jsonb)",
        [orgId, f.id, f.brand_id, k, String(ideas[i].topic).slice(0, 300), String(ideas[i].hook ?? "").slice(0, 400), dates[i], f.approval === "auto" ? "approved" : "idea"]);
    }
    return { ok: true, text: `Добавил в контент-план «${f.name}» идей: ${ideas.length}${f.approval === "auto" ? " (одобрены, воркер напишет их по расписанию)" : ". Они ждут вашего одобрения"}`, refs: [{ t: "plan", id: f.id }] };
  } catch (e) { await refund(orgId, cost, "ошибка серии материалов"); return { ok: false, text: `Не получилось, деньги возвращены: ${(e as Error).message.slice(0, 120)}` }; }
}

/** Правка присланной картинки по описанию («убери надпись», «смени фон»). Результат показывается в чате; с itemId сразу ставится в материал. */
export async function editAttachedImage(orgId: string, a: Args): Promise<SetupResult> {
  const src = uuid(a.assetId) ? await loadAsset(orgId, uuid(a.assetId)) : null;
  if (!src || !src.mime.startsWith("image/")) return { ok: false, text: "Не нашёл картинку. Прикрепите её к сообщению" };
  const ins = clip(a.instruction, 400);
  if (ins.length < 3) return { ok: false, text: "Опишите, что изменить на картинке" };
  const err = await notFree(orgId, PRICES.image, "Доработка изображения: вложение");
  if (err) return { ok: false, text: err };
  try {
    const aspect = src.width > src.height * 1.2 ? "landscape" : src.height > src.width * 1.2 ? "portrait" : "square";
    const r = await editImage(src.data, src.mime, ins, aspect);
    const id = await saveAsset(orgId, null, "generated", `правка-${src.name}`.slice(0, 100), await processImage(r.data, "generated"), "вложение чата");
    const itemId = uuid(a.itemId);
    if (itemId && (await copyAssetToItem(orgId, id, itemId).catch(() => false))) return { ok: true, text: "Картинка изменена и поставлена в материал", itemIds: [itemId] };
    return { ok: true, text: "Картинка изменена", refs: [{ t: "image", ids: [id] }] };
  } catch (e) { await refund(orgId, PRICES.image, "ошибка правки изображения"); return { ok: false, text: `Не получилось, деньги возвращены: ${(e as Error).message.slice(0, 140)}` }; }
}

/** Запомнить правило бренда («не пиши про цены», «всегда добавляй ссылку»): попадает в каждую следующую генерацию. */
export async function rememberRule(orgId: string, a: Args): Promise<SetupResult> {
  const rule = clip(a.rule, 200);
  if (rule.length < 4) return { ok: false, text: "Сформулируйте правило полнее" };
  const bid = uuid(a.brandId) || (await one<{ id: string }>("select id from kz_brands where org_id=$1 order by created_at limit 1", [orgId]))?.id;
  const b = bid ? await one<{ id: string; rules: { forbidden?: string[]; notes?: string[] } | null }>("select id,rules from kz_brands where id=$1 and org_id=$2", [bid, orgId]) : null;
  if (!b) return { ok: false, text: "Не нашёл бренд" };
  const rules = { ...(b.rules ?? {}), forbidden: b.rules?.forbidden ?? [], notes: b.rules?.notes ?? [] };
  if (String(a.op) === "remove") {
    const before = rules.notes.length + rules.forbidden.length;
    rules.notes = rules.notes.filter((x) => !x.toLowerCase().includes(rule.toLowerCase()));
    rules.forbidden = rules.forbidden.filter((x) => !x.toLowerCase().includes(rule.toLowerCase()));
    if (rules.notes.length + rules.forbidden.length === before) return { ok: false, text: "Такого правила нет в памяти бренда" };
  } else if (String(a.kind) === "forbidden") { if (!rules.forbidden.includes(rule)) rules.forbidden = [...rules.forbidden, rule].slice(-40); }
  else if (!rules.notes.includes(rule)) rules.notes = [...rules.notes, rule].slice(-30);
  await q("update kz_brands set rules=$3::jsonb where id=$1 and org_id=$2", [b.id, orgId, JSON.stringify(rules)]);
  return { ok: true, text: String(a.op) === "remove" ? "Правило убрано" : "Запомнил: буду учитывать во всех следующих материалах бренда", refs: [{ t: "brand", id: b.id }] };
}
