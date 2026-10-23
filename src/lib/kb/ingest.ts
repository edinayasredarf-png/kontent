import JSZip from "jszip";
import { safeFetchText } from "../safefetch";
import { htmlTitle, htmlToText } from "../repurpose";

import { KB_KINDS, type KbKind } from "./kinds";
export { KB_KINDS, type KbKind };
export const isKind = (v: unknown): v is KbKind => typeof v === "string" && v in KB_KINDS;
export const KB_LIMITS = { docs: 40, chars: 60_000, minChars: 80, fileBytes: 4_000_000 };

const xmlText = (xml: string) => xml.replace(/<\/w:p>|<w:br\s*\/>|<w:tab\s*\/>/g, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const tidy = (t: string) => t.replace(/\r/g, "").replace(/[ \t\f\v]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** Текст из загруженного файла: txt, md, csv, html, docx, pdf (с текстовым слоем), xlsx. */
export async function fileToText(name: string, data: Buffer): Promise<{ title: string; text: string }> {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) ?? "";
  const title = name.replace(/\.[a-z0-9]+$/i, "").slice(0, 200) || "Документ";
  if (ext === "docx") {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(data); } catch { throw new Error("Файл docx повреждён"); }
    const f = zip.file("word/document.xml");
    if (!f) throw new Error("В файле docx нет текста");
    return { title, text: tidy(xmlText(await f.async("string"))) };
  }
  if (["txt", "md", "markdown", "csv", "text", ""].includes(ext)) return { title, text: tidy(data.toString("utf8")) };
  if (ext === "html" || ext === "htm") { const h = data.toString("utf8"); return { title: htmlTitle(h) || title, text: htmlToText(h) }; }
  if (ext === "pdf") {
    try {
      const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
      const r = await pdf(data);
      const text = tidy(r.text);
      if (text.length < 20) throw new Error("scan");
      return { title, text };
    } catch (e) { throw new Error((e as Error).message === "scan" ? "В PDF нет текстового слоя (это скан): пришлите картинкой или вставьте текст" : "Не удалось прочитать PDF: файл повреждён или защищён паролем"); }
  }
  if (ext === "xlsx") {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(data); } catch { throw new Error("Файл xlsx повреждён"); }
    const dec = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    const shared = [...(await zip.file("xl/sharedStrings.xml")?.async("string") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
    const sheets = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort().slice(0, 3);
    const out: string[] = [];
    for (const f of sheets) {
      const xml = await zip.file(f)!.async("string");
      for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells = [...row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
          const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? c[2]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
          return /t="s"/.test(c[1]) ? shared[Number(v)] ?? "" : dec(v);
        });
        if (cells.some((x) => x.trim())) out.push(cells.join(" | "));
        if (out.length > 600) break;
      }
    }
    const text = tidy(out.join("\n"));
    if (!text) throw new Error("В таблице нет данных");
    return { title, text };
  }
  throw new Error("Поддерживаются файлы .txt, .md, .docx, .html, .csv, .pdf (с текстом) и .xlsx. Для .doc сохраните файл как .docx");
}

/** Страница по ссылке → заголовок и основной текст. JS-сайты и закрытые страницы могут не прочитаться — об этом честно говорим. */
export async function urlToText(raw: string): Promise<{ title: string; text: string; url: string }> {
  const u = raw.trim();
  if (!/^https?:\/\//i.test(u)) throw new Error("Ссылка должна начинаться с http:// или https://");
  const page = await safeFetchText(u, { maxBytes: 3_000_000 }).catch((e) => { throw new Error(`Не удалось открыть ссылку: ${(e as Error).message}. Вставьте текст статьи вручную.`); });
  const html = /<(html|body|p|div|article)\b/i.test(page.text);
  const text = html ? htmlToText(page.text) : page.text.trim();
  if (text.length < KB_LIMITS.minChars * 2) throw new Error("На странице почти нет текста (возможно, она строится скриптами или закрыта). Вставьте текст вручную.");
  return { title: (html ? htmlTitle(page.text) : "") || new URL(page.url).hostname, text, url: page.url };
}

/** Вставленный список ссылок (по одной в строке) → адреса, не больше 10 за раз. */
export const parseLinks = (t: string) => [...new Set(t.split(/\s+/).map((x) => x.trim()).filter((x) => /^https?:\/\/\S+$/i.test(x)))].slice(0, 10);
