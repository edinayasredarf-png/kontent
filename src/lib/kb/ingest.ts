import JSZip from "jszip";
import { safeFetchText } from "../safefetch";
import { htmlTitle, htmlToText } from "../repurpose";

import { KB_KINDS, type KbKind } from "./kinds";
export { KB_KINDS, type KbKind };
export const isKind = (v: unknown): v is KbKind => typeof v === "string" && v in KB_KINDS;
export const KB_LIMITS = { docs: 40, chars: 60_000, minChars: 80, fileBytes: 4_000_000 };

const xmlText = (xml: string) => xml.replace(/<\/w:p>|<w:br\s*\/>|<w:tab\s*\/>/g, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const tidy = (t: string) => t.replace(/\r/g, "").replace(/[ \t\f\v]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** Текст из загруженного файла: txt, md, csv, html, docx. Остальное (pdf, doc) честно не поддерживаем. */
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
  throw new Error("Поддерживаются файлы .txt, .md, .docx, .html. PDF и .doc откройте и вставьте текст в поле");
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
