import { attachUploadToItems } from "../item-images";
import { angleTask } from "./angles";
import { POST_TYPES } from "../postsettings";
import { kbText } from "../kb/use";
import { one, q, tx } from "../db";
import { aiReady, brandBlock, chat, extractObject, extractArray, type BrandCtx } from "../ai";
import { extractArticle } from "../article";
import { ARTICLE_STATUS } from "../article-content";
import type { Media } from "./parse";
import { safeFetchText } from "../safefetch";
import { InsufficientFunds, PRICES, charge, refund } from "../wallet";
import { buildItem } from "../pipeline";
import { allocateDates } from "../plan";
import { KINDS } from "../plan";

const MAX_FULL = 20_000;
export interface FeedRow { id: string; title: string; body: string; url: string; full_text: string | null; full_status: string; kind: string; media: Media[] }

/** A cleaned article is authoritative even when shorter than an RSS excerpt. Legacy page dumps must not win by length. */
export const bestText = (r: { title: string; body: string; full_text: string | null; full_status?: string }) => {
  if (r.full_status !== undefined) return r.full_status === ARTICLE_STATUS && r.full_text ? r.full_text : r.body || r.title;
  return r.full_text && r.full_text.length > r.body.length ? r.full_text : r.body || r.title;
};

/** Extract only article content; reader-mode failures never fall back to a whole-page text dump. */
export async function enrichItem(orgId: string, itemId: string, force = false): Promise<{ ok: boolean; status: string; note?: string }> {
  const it = await one<FeedRow>(
    `select i.id,i.title,i.body,i.url,i.full_text,i.full_status,i.media,s.kind from kz_feed_items i join kz_sources s on s.id=i.source_id where i.id=$1 and i.org_id=$2`, [itemId, orgId]);
  if (!it) return { ok: false, status: "failed", note: "Новость не найдена" };
  if (!["site", "news"].includes(it.kind)) return { ok: true, status: "ok", note: "Текст уже полный" };
  if (!force && it.full_text && it.full_status === ARTICLE_STATUS) return { ok: true, status: "ok" };
  const fail = async (status: string, note: string) => {
    await q("update kz_feed_items set full_text=null,full_status=$3 where id=$1 and org_id=$2", [itemId, orgId, status === "unsupported" ? status : `${ARTICLE_STATUS}:${status}`]);
    return { ok: false, status, note };
  };
  if (!/^https?:\/\//i.test(it.url)) return fail("unsupported", "У новости нет ссылки");
  if (/(^|\.)news\.google\.com$/i.test(new URL(it.url).hostname)) return fail("unsupported", "Google Новости не отдаёт текст статьи: откройте оригинал или добавьте его RSS-ленту.");
  try {
    const page = await safeFetchText(it.url, { maxBytes: 3_000_000 });
    const article = await extractArticle(page.text, page.url);
    if (!article) return fail("short", "На странице не найден текст статьи. Показан анонс из RSS; полный материал можно открыть на сайте источника.");
    const images = article.media.filter((m) => m.type === "image");
    const media = [...(images.length ? images : (it.media ?? []).filter((m) => m.type === "image")), ...article.media.filter((m) => m.type === "file")];
    await q("update kz_feed_items set full_text=$3,full_status=$4,media=$5,title=$6 where id=$1 and org_id=$2", [itemId, orgId, article.text.slice(0, MAX_FULL), ARTICLE_STATUS, JSON.stringify(media), article.title.slice(0, 300) || it.title]);
    return { ok: true, status: "ok", ...(article.text.length < 150 && article.media.some((m) => m.type === "file") ? { note: "Источник содержит прикреплённый документ. Ссылка добавлена в карточку." } : {}) };
  } catch (e) { return fail("failed", `Не удалось открыть статью: ${(e as Error).message.slice(0, 120)}`); }
}

/** New entries and legacy unclean copies are repaired in bounded background batches, never while rendering a page. */
export async function enrichRecent(orgId: string, sourceId: string, limit = 5): Promise<number> {
  const rows = await q<{ id: string }>(
    `select i.id from kz_feed_items i join kz_sources s on s.id=i.source_id
      where i.org_id=$1 and i.source_id=$2 and s.kind in ('site','news') and i.full_status<>$4 and i.full_status not like $5 and i.full_status<>'unsupported' and i.url like 'http%'
      order by i.published_at desc limit $3`, [orgId, sourceId, limit, ARTICLE_STATUS, `${ARTICLE_STATUS}:%`]);
  let count = 0;
  for (let i = 0; i < rows.length; i += 3) {
    const rs = await Promise.all(rows.slice(i, i + 3).map((r) => enrichItem(orgId, r.id).catch(() => ({ ok: false }))));
    count += rs.filter((r) => r.ok).length;
  }
  return count;
}

/* ───────── контекст бренда для подсказок ───────── */
interface Ctx { brand: BrandCtx; product: string; niche: string; text: string }
async function brandContext(orgId: string, brandId: string): Promise<Ctx | null> {
  const b = await one<{ name: string; description: string; audience: string; tone: string; rules: { forbidden?: string[] } | null }>("select name,description,audience,tone,rules from kz_brands where id=$1 and org_id=$2", [brandId, orgId]);
  if (!b) return null;
  const f = await q<{ name: string; product: string; niche: string }>("select name,product,niche from kz_factories where brand_id=$1 and org_id=$2 and status='active' order by created_at limit 5", [brandId, orgId]);
  const brand: BrandCtx = { name: b.name, description: b.description, audience: b.audience, tone: b.tone, forbidden: b.rules?.forbidden ?? [], kb: (await kbText(orgId, brandId).catch(() => "")) || undefined };
  const product = f.map((x) => x.product).filter(Boolean).join("; "), niche = f.map((x) => x.niche).filter(Boolean).join("; ");
  return { brand, product, niche, text: brandBlock(brand, product, niche) };
}

/**
 * Подборка: нейросеть оценивает свежие новости по профилю бренда (0–10) и коротко объясняет, чем новость полезна. Оценки сохраняются в ленте,
 * поэтому можно отфильтровать «подходит мне». Платно (как сводка), при сбое возврат.
 */
export async function scoreNews(orgId: string, brandId: string): Promise<{ ok: true; scored: number } | { ok: false; error: string }> {
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const ctx = await brandContext(orgId, brandId);
  if (!ctx) return { ok: false, error: "Выберите бренд" };
  const items = await q<{ id: string; title: string; body: string; full_text: string | null; full_status: string }>(
    `select id,title,body,full_text,full_status from kz_feed_items where org_id=$1 and not excluded and status in ('new','saved') and published_at > now() - interval '7 days' order by published_at desc limit 40`, [orgId]);
  if (items.length < 3) return { ok: false, error: "Для подборки нужно хотя бы 3 свежие новости. Добавьте источники и обновите ленту." };
  const cost = PRICES.digest;
  try { await charge(orgId, cost, "Подборка новостей под бренд"); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const list = items.map((it, n) => `${n + 1}. ${it.title}${bestText(it) && bestText(it) !== it.title ? " — " + bestText(it).replace(/\s+/g, " ").slice(0, 220) : ""}`).join("\n");
    const raw = await chat("idea", "Ты редактор-стратег контента. Отвечай ТОЛЬКО валидным JSON-массивом без пояснений.",
      `${ctx.text}\n\nНовости:\n${list}\n\nОцени каждую новость от 0 до 10 по тому, насколько она подходит бренду: можно ли сделать полезный и честный материал для его аудитории, есть ли связь с продуктом или темой. Реклама, мусор и посторонние темы — низкая оценка. Для каждой дай "reason" — одна короткая фраза, как использовать новость (угол подачи).\nФормат: [{"n":1,"score":7,"reason":"..."}] — для всех ${items.length} новостей.`,
      { maxTokens: 2500, temperature: 0.2, timeoutMs: 55_000 });
    const arr = extractArray(raw);
    if (!arr) throw new Error("Модель не вернула оценки");
    let n = 0;
    await tx(async (run) => {
      for (const x of arr as { n?: number; score?: number; reason?: string }[]) {
        const it = items[Number(x.n) - 1]; if (!it) continue;
        await run("update kz_feed_items set fit_score=$2, fit_reason=$3, fit_at=now() where id=$1", [it.id, Math.min(10, Math.max(0, Math.round(Number(x.score) || 0))), String(x.reason ?? "").slice(0, 200)]);
        n++;
      }
    });
    if (!n) throw new Error("Оценок нет в ответе модели");
    return { ok: true, scored: n };
  } catch (e) { await refund(orgId, cost, "ошибка подборки новостей"); return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` }; }
}

export interface KwSuggestion { include: { word: string; why: string }[]; exclude: { word: string; why: string }[] }
/** Ключевые слова для фильтрации новостей по описанию бренда, продуктам заводов и уже добавленным словам. Слова даются в начальной форме: поиск находит падежи. */
export async function suggestKeywords(orgId: string, brandId: string): Promise<{ ok: true; s: KwSuggestion } | { ok: false; error: string }> {
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const ctx = await brandContext(orgId, brandId);
  if (!ctx) return { ok: false, error: "Выберите бренд" };
  const have = (await q<{ word: string; kind: string }>("select word,kind from kz_keywords where org_id=$1", [orgId])).map((k) => k.word);
  const cost = PRICES.idea;
  try { await charge(orgId, cost, "Подбор ключевых слов"); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const o = extractObject(await chat("idea", "Ты специалист по мониторингу новостей. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений.",
      `${ctx.text}\n${have.length ? `Уже добавлены слова (не повторяй): ${have.slice(0, 80).join(", ")}\n` : ""}\nПодбери ключевые слова для отбора новостей, которые могут пригодиться этой компании для контента.\n"include" — 20 слов и коротких фраз (1–3 слова): темы, термины, события, законы, продукты, проблемы и вопросы аудитории, конкуренты и смежные отрасли. Давай слова в начальной форме без окончаний-вариантов (поиск сам находит падежи). "exclude" — 8 слов, по которым стоит отсекать мусор и посторонние темы (гороскопы, скандалы, реклама, нерелевантные отрасли). У каждого слова "why" — до 8 слов, зачем оно.\nФормат: {"include":[{"word":"...","why":"..."}],"exclude":[{"word":"...","why":"..."}]}`,
      { maxTokens: 2200, temperature: 0.5, timeoutMs: 50_000 }));
    const clean = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => ({ word: String((x as { word?: unknown })?.word ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60), why: String((x as { why?: unknown })?.why ?? "").slice(0, 100) }))
      .filter((x, i, a) => x.word.length >= 2 && !have.includes(x.word) && a.findIndex((y) => y.word === x.word) === i).slice(0, max);
    const s = { include: clean(o?.include, 25), exclude: clean(o?.exclude, 10) };
    if (!s.include.length) throw new Error("Модель не предложила слов");
    return { ok: true, s };
  } catch (e) { await refund(orgId, cost, "ошибка подбора слов"); return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` }; }
}

/* ───────── материал из новости ───────── */
export const MAKE_KINDS = KINDS.filter((k) => !["reels"].includes(k)) as readonly string[];

/**
 * Создать материалы из новости: выбранные типы (пост, карусель, SEO-статья…) по полному тексту. «Сразу» — материалы пишутся без карточек-идей
 * (первые три в этом запросе, остальные уйдут в очередь воркера), «в план» — только идеи. Источник хранится в материале: факты берутся оттуда.
 */
export async function createFromNews(orgId: string, itemId: string, factoryId: string, kinds: string[], now: boolean, opts: { angle?: string; note?: string; postType?: string; date?: string; image?: FormDataEntryValue | null; draft?: boolean } = {}): Promise<{ ok: true; ids: string[]; error?: string } | { ok: false; error: string }> {
  const ks = [...new Set(kinds.filter((k) => MAKE_KINDS.includes(k)))].slice(0, 6);
  if (!ks.length) return { ok: false, error: "Выберите хотя бы один тип материала" };
  const it = await one<{ id: string; title: string; body: string; url: string; full_text: string | null; full_status: string; status: string; source: string }>(
    `select i.id,i.title,i.body,i.url,i.full_text,i.full_status,i.status,s.title source from kz_feed_items i join kz_sources s on s.id=i.source_id where i.id=$1 and i.org_id=$2`, [itemId, orgId]);
  if (!it) return { ok: false, error: "Новость не найдена" };
  const fac = await one<{ brand_id: string }>("select brand_id from kz_factories where id=$1 and org_id=$2", [factoryId, orgId]);
  if (!fac) return { ok: false, error: "Выберите завод" };
  if (it.full_status !== ARTICLE_STATUS) await enrichItem(orgId, itemId);
  const full = await one<{ full_text: string | null; full_status: string }>("select full_text,full_status from kz_feed_items where id=$1 and org_id=$2", [itemId, orgId]);
  const text = bestText({ ...it, full_text: full?.full_text ?? null, full_status: full?.full_status ?? "" });
  const source = { title: it.title, url: it.url, name: it.source, body: (angleTask(opts.angle ?? "") ? `ЗАДАНИЕ ПО ПОДАЧЕ: ${angleTask(opts.angle ?? "")}\n\n` : "") + (opts.note ? `ЗАДАНИЕ ПО ПОДАЧЕ: ${opts.note}\n\n` : "") + text.slice(0, 8000) };
  // дата не выбрана — ближайшие свободные дни по расписанию завода
  const picked = opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : null;
  const dates = picked ? ks.map(() => picked) : await allocateDates(factoryId, ks.length);
  const ids = await tx(async (run) => {
    const out: string[] = [];
    for (let i = 0; i < ks.length; i++) {
      const [c] = await run<{ id: string }>("insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,planned_for,status,meta) values($1,$2,$3,$4,$5,'',$6,$7,$8) returning id",
        [orgId, factoryId, fac.brand_id, ks[i], it.title.slice(0, 300), opts.draft ? (i < 3 ? null : new Date().toISOString().slice(0, 10)) : dates[i], now ? "approved" : "idea", JSON.stringify({ source, fromNews: true, ...(opts.draft ? { draft: true } : {}), ...(opts.postType && opts.postType in POST_TYPES ? { postType: opts.postType } : {}) })]);
      out.push(c.id);
    }
    await run("update kz_feed_items set status='used', content_item_id=$2 where id=$1", [itemId, out[0]]);
    return out;
  });
  let error: string | undefined;
  const imgErr = await attachUploadToItems(orgId, fac.brand_id, opts.image ?? null, ks.map((k, i) => ({ id: ids[i], kind: k })));
  if (imgErr) error = `Изображение не прикреплено: ${imgErr}`;
  if (now) {
    const t0 = Date.now();
    for (const id of ids.slice(0, 3)) {
      if (Date.now() - t0 > 170_000) break;
      const r = await buildItem(orgId, id);
      if (!r.ok) { error = r.error; break; }
    }
  }
  return { ok: true, ids, error };
}
