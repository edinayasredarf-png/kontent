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

export async function genSeoArticle(b: BrandCtx, product: string, niche: string, keyword: string, angle: string, source?: SourceNote): Promise<{ meta: SeoMeta; html: string }> {
  const raw = await chat("article",
    "Ты SEO-редактор. Пиши по-русски полезные экспертные статьи для людей, а не для роботов: без воды, без переспама ключом, без выдуманных фактов, цифр и ссылок. Если данных не хватает — пиши общими проверяемыми утверждениями.",
    `Бренд: ${b.name}\nОписание: ${b.description}\nАудитория: ${b.audience}\nТон: ${b.tone}\nПродукт: ${product}\nНиша: ${niche}\n` +
    (b.forbidden.length ? `НЕЛЬЗЯ упоминать: ${b.forbidden.join(", ")}\n` : "") +
    `\nГлавный поисковый запрос: «${keyword}»\nУгол/намерение: ${angle || "информационное: ответить на вопрос исчерпывающе"}\n` +
    (source ? `\nМатериал-источник (${source.url}): «${source.title}»\n${source.body.slice(0, 2500)}\nИспользуй только факты оттуда, своими словами.\n` : "") +
    `\nТребования: 1000–1500 слов; 4–6 разделов <h2>, где нужно — <h3>; запрос естественно встречается в заголовке, первом абзаце и 1–2 подзаголовках; списки и короткие абзацы; в конце — вывод и мягкий призыв к действию от бренда. Без <h1>.\n` +
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
