import sanitizeHtml from "sanitize-html";
import { chat } from "./ai";
import type { BrandCtx, SourceNote } from "./ai";

export interface SeoMeta { title: string; description: string; slug: string; keywords: string[]; faq: { q: string; a: string }[]; keyword: string }

/** Разрешённая разметка статьи. Всё остальное (script, style, iframe, on*-атрибуты) вырезается: HTML уходит на сайты клиентов. */
export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["h2", "h3", "h4", "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "img", "figure", "figcaption", "hr", "code", "pre"],
    allowedAttributes: { a: ["href", "title", "rel", "target"], img: ["src", "alt", "title", "width", "height"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: { a: (tag, attribs) => ({ tagName: "a", attribs: { ...attribs, rel: "noopener noreferrer" } }) },
    disallowedTagsMode: "discard",
  }).trim();
}

const TRANSLIT: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
export function slugify(s: string): string {
  const t = s.toLowerCase().split("").map((ch) => TRANSLIT[ch] ?? ch).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return t.slice(0, 70).replace(/-+$/, "") || "article";
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Модель отвечает блоками с маркерами, а не JSON: в длинном HTML кавычки и переносы ломают JSON чаще, чем маркеры. */
export function parseSeoResponse(raw: string, keyword: string): { meta: SeoMeta; html: string } {
  const field = (name: string) => raw.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";
  const bodyM = raw.match(/---\s*BODY\s*---\s*([\s\S]*?)(?:---\s*FAQ\s*---|$)/i);
  const faqM = raw.match(/---\s*FAQ\s*---\s*([\s\S]*)$/i);
  let html = cleanHtml((bodyM?.[1] ?? "").trim());
  if (!html) throw new Error("Модель не вернула текст статьи");
  const faq: { q: string; a: string }[] = [];
  for (const m of (faqM?.[1] ?? "").matchAll(/Q:\s*(.+?)\s*\n\s*A:\s*([\s\S]+?)(?=\n\s*Q:|\s*$)/gi)) faq.push({ q: textOf(m[1]), a: textOf(m[2]) });
  if (faq.length) {
    html += `\n<h2>Частые вопросы</h2>\n` + faq.map((f) => `<h3>${sanitizeHtml(f.q, { allowedTags: [] })}</h3>\n<p>${sanitizeHtml(f.a, { allowedTags: [] })}</p>`).join("\n");
  }
  const title = (field("TITLE") || keyword).slice(0, 90);
  return {
    html,
    meta: {
      title, description: (field("DESCRIPTION") || textOf(html).slice(0, 155)).slice(0, 200), slug: slugify(field("SLUG") || title),
      keywords: field("KEYWORDS").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 12), faq, keyword,
    },
  };
}

const SEO_SYSTEM = "Ты SEO-редактор. Пиши по-русски полезные экспертные статьи для людей, а не для роботов: без воды, без переспама ключом, без выдуманных фактов, цифр и ссылок. Если данных не хватает — пиши общими проверяемыми утверждениями.";
export const SEO_TARGET_WORDS = 1100;

const context = (b: BrandCtx, product: string, niche: string, keyword: string, angle: string, source?: SourceNote) =>
  `Бренд: ${b.name}\nОписание: ${b.description}\nАудитория: ${b.audience}\nТон: ${b.tone}\nПродукт: ${product}\nНиша: ${niche}\n` +
  (b.forbidden.length ? `НЕЛЬЗЯ упоминать: ${b.forbidden.join(", ")}\n` : "") +
  `\nГлавный поисковый запрос: «${keyword}»\nУгол/намерение: ${angle || "информационное: ответить на вопрос исчерпывающе"}\n` +
  (source ? `\nМатериал-источник (${source.url}): «${source.title}»\n${source.body.slice(0, 2500)}\nИспользуй только факты оттуда, своими словами.\n` : "");

export interface Outline { title: string; description: string; slug: string; keywords: string; sections: { h: string; brief: string }[]; faq: string[] }

/** План статьи по маркерам: TITLE/DESCRIPTION/SLUG/KEYWORDS, строки SECTION: заголовок | о чём и FAQ: вопрос. */
export function parseOutline(raw: string): Outline {
  const field = (name: string) => raw.match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";
  const sections = [...raw.matchAll(/^\s*SECTION\s*:\s*(.+)$/gim)].map((m) => { const [h, ...rest] = m[1].split("|"); return { h: textOf(h).slice(0, 110), brief: textOf(rest.join("|")).slice(0, 300) }; }).filter((x) => x.h);
  const faq = [...raw.matchAll(/^\s*FAQ\s*:\s*(.+)$/gim)].map((m) => textOf(m[1]).slice(0, 200)).filter(Boolean);
  return { title: field("TITLE"), description: field("DESCRIPTION"), slug: field("SLUG"), keywords: field("KEYWORDS"), sections: sections.slice(0, 8), faq: faq.slice(0, 5) };
}

const wordCount = (html: string) => textOf(html).split(/\s+/).filter(Boolean).length;

/** Параллельность ограничена: шлюз и таймаут функции не любят десяток одновременных запросов. */
async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

/** Один раздел: заголовок h2 и 220–320 слов. Сбой раздела не роняет статью: её дописывает следующий этап или раздел пропускается. */
async function genSection(ctx: string, outline: Outline, i: number, kind: "intro" | "section", keyword: string): Promise<string> {
  const sec = kind === "section" ? outline.sections[i] : null;
  const toc = outline.sections.map((x, n) => `${n + 1}. ${x.h}`).join("\n");
  const task = kind === "intro"
    ? `Напиши ВСТУПЛЕНИЕ статьи: 2 абзаца, 110–160 слов. Запрос «${keyword}» естественно встречается в первом предложении. Без заголовка. Только HTML: <p>…</p>.`
    : `Напиши раздел «${sec!.h}» (о чём: ${sec!.brief || "раскрой тему раздела"}): 230–330 слов, конкретика и польза, где уместно — список <ul><li>. Начни с <h2>${sec!.h}</h2>. Только HTML: h2, h3, p, ul, ol, li, strong, em, blockquote. Не повторяй содержание других разделов.${i === outline.sections.length - 1 ? " Это завершающий раздел: сделай вывод и мягкий призыв к действию от бренда." : ""}`;
  const raw = await chat("article", SEO_SYSTEM, `${ctx}\nТема статьи: «${outline.title || keyword}»\nПлан статьи:\n${toc}\n\n${task}`, { maxTokens: 1700, temperature: 0.6, timeoutMs: 50_000 });
  return cleanHtml(raw.replace(/^```(?:html)?\s*|```\s*$/g, "").trim());
}

/**
 * SEO-статья по шагам: план (заголовок, описание, разделы, вопросы) → вступление и разделы отдельными запросами (по 3 параллельно) →
 * вопросы-ответы → проверка объёма с дописыванием. Так длина не упирается в один лимит ответа модели, как при генерации «всё сразу».
 * Если план не получился (модель не слушается формата), используется прежний одношаговый способ.
 */
export async function genSeoArticle(b: BrandCtx, product: string, niche: string, keyword: string, angle: string, source?: SourceNote): Promise<{ meta: SeoMeta; html: string }> {
  const ctx = context(b, product, niche, keyword, angle, source);
  let outline: Outline | null = null;
  try {
    const o = parseOutline(await chat("article", SEO_SYSTEM,
      `${ctx}\nСоставь план статьи на 1100–1500 слов. Формат ответа строго такой, без пояснений:\nTITLE: заголовок до 60 знаков, с запросом\nDESCRIPTION: описание 120–155 знаков\nSLUG: короткий-адрес-латиницей\nKEYWORDS: 5–8 ключевых слов через запятую\nSECTION: заголовок раздела | о чём раздел, что раскрыть (5–6 строк SECTION: последний раздел — вывод и призыв к действию; запрос должен быть в 1–2 заголовках)\nFAQ: вопрос читателя (4–5 строк FAQ:)`,
      { maxTokens: 1200, temperature: 0.5, timeoutMs: 40_000 }));
    if (o.sections.length >= 4 && o.title) outline = o;
  } catch { /* запасной путь ниже */ }
  if (!outline) return genSeoArticleSingle(ctx, keyword);

  const jobs: { kind: "intro" | "section"; i: number }[] = [{ kind: "intro", i: 0 }, ...outline.sections.map((_, i) => ({ kind: "section" as const, i }))];
  const parts = await pool(jobs, 3, async (j) => { try { return await genSection(ctx, outline!, j.i, j.kind, keyword); } catch { return ""; } });
  const faqParts = outline.faq.length
    ? await chat("article", SEO_SYSTEM, `${ctx}\nТема статьи: «${outline.title}»\nОтветь на вопросы читателя по 1–3 предложения каждый, только по делу. Формат строго:\nQ: вопрос\nA: ответ\n\nВопросы:\n${outline.faq.map((q) => "- " + q).join("\n")}`, { maxTokens: 1200, temperature: 0.5, timeoutMs: 45_000 }).catch(() => "")
    : "";

  let intro = parts[0], sections = parts.slice(1);
  if (!intro && !sections.some(Boolean)) return genSeoArticleSingle(ctx, keyword);
  // дописываем, если получилось короче цели: два дополнительных раздела перед выводом (одна попытка)
  const total = () => wordCount([intro, ...sections].join(" "));
  if (total() < SEO_TARGET_WORDS) {
    const have = outline.sections.map((x) => x.h).join("; ");
    const extra = await pool(["Практические советы и типичные ошибки", "Как применить это на практике: шаги и примеры"], 2, async (h) => {
      try { return await genSection(ctx, { ...outline!, sections: [...outline!.sections, { h, brief: `дополни статью, не повторяя разделы: ${have}` }] }, outline!.sections.length, "section", keyword); } catch { return ""; }
    });
    const add = extra.filter((x) => x && wordCount(x) > 80);
    if (add.length) sections = [...sections.slice(0, -1), ...add, sections[sections.length - 1]].filter(Boolean);
  }
  const body = [intro, ...sections].filter(Boolean).join("\n");
  const raw = `TITLE: ${outline.title}\nDESCRIPTION: ${outline.description}\nSLUG: ${outline.slug}\nKEYWORDS: ${outline.keywords}\n---BODY---\n${body}\n---FAQ---\n${faqParts}`;
  return parseSeoResponse(raw, keyword);
}

/** Запасной способ: вся статья одним ответом (может получиться короче из-за лимита ответа). */
async function genSeoArticleSingle(ctx: string, keyword: string): Promise<{ meta: SeoMeta; html: string }> {
  const raw = await chat("article", SEO_SYSTEM,
    `${ctx}\nТребования: 1000–1500 слов; 4–6 разделов <h2>, где нужно — <h3>; запрос естественно встречается в заголовке, первом абзаце и 1–2 подзаголовках; списки и короткие абзацы; в конце — вывод и мягкий призыв к действию от бренда. Без <h1>.\n` +
    `ФОРМАТ ОТВЕТА строго такой (маркеры оставь как есть):\nTITLE: заголовок до 60 знаков\nDESCRIPTION: описание 120–155 знаков\nSLUG: короткий-адрес-латиницей\nKEYWORDS: 5–8 ключевых слов через запятую\n---BODY---\n(HTML: только h2,h3,p,ul,ol,li,strong,em,blockquote,table)\n---FAQ---\nQ: вопрос\nA: ответ 1–3 предложения\n(3–5 пар)`,
    { maxTokens: 4500, temperature: 0.6, timeoutMs: 58_000 });
  return parseSeoResponse(raw, keyword);
}

export interface Check { ok: boolean; label: string; hint?: string }

/** Проверка по правилам, которые можно проверить кодом. Это подсказка редактору, а не обещание позиций в выдаче. */
export function seoCheck(meta: SeoMeta, html: string): { checks: Check[]; score: number } {
  const text = textOf(html), words = text.split(/\s+/).filter(Boolean), n = words.length;
  const kw = meta.keyword.toLowerCase().replace(/ё/g, "е");
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");
  const kwStem = kw.split(/\s+/).map((w) => (w.length >= 6 ? w.slice(0, -2) : w.length >= 4 ? w.slice(0, -1) : w));
  const has = (s: string) => kwStem.every((w) => norm(s).includes(w));
  const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => textOf(m[1]));
  const firstP = textOf(html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
  const occ = kwStem.length ? (norm(text).split(kwStem[0]).length - 1) : 0;
  const density = n ? (occ / n) * 100 : 0;
  const checks: Check[] = [
    { ok: meta.title.length >= 25 && meta.title.length <= 65, label: `Title ${meta.title.length} знаков`, hint: "оптимально 30–60" },
    { ok: has(meta.title), label: "Запрос есть в Title" },
    { ok: meta.description.length >= 100 && meta.description.length <= 170, label: `Description ${meta.description.length} знаков`, hint: "оптимально 120–160" },
    { ok: n >= 800, label: `Объём ${n} слов`, hint: "от 800" },
    { ok: h2.length >= 3, label: `Подзаголовков H2: ${h2.length}`, hint: "от 3" },
    { ok: has(firstP), label: "Запрос есть в первом абзаце" },
    { ok: h2.some(has), label: "Запрос есть хотя бы в одном H2" },
    { ok: density >= 0.3 && density <= 2.5, label: `Частота запроса ${density.toFixed(1)}%`, hint: "0,3–2,5%, больше — риск переспама" },
    { ok: meta.faq.length >= 3, label: `Блок вопросов: ${meta.faq.length}`, hint: "от 3" },
    { ok: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug) && meta.slug.length <= 70, label: "Адрес (slug) читаемый, латиницей" },
  ];
  return { checks, score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100) };
}
