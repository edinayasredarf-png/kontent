import JSZip from "jszip";
import { parse, HTMLElement, TextNode, type Node } from "node-html-parser";
import { slugify } from "./seo";

/** Материал в виде, достаточном для выгрузки. Поля из meta передаются отдельно, чтобы не зависеть от запроса. */
export interface ExportItem {
  kind: string; topic: string; hook?: string; body: string; status?: string; planned_for?: string | null;
  seo?: { title: string; description?: string } | null;
  email?: { subject: string; preheader?: string; headline?: string; cta?: string; ctaUrl?: string } | null;
  guide?: { title: string; subtitle?: string } | null;
  carousel?: { slides: { title: string; body: string }[] } | null;
  infographic?: { title: string; subtitle?: string; blocks: { head: string; text: string }[] } | null;
  poll?: { question: string; options: string[] } | null;
}

export const HTML_KINDS = ["seo", "email", "guide"];
export const isHtmlKind = (k: string) => HTML_KINDS.includes(k);

export function titleOf(it: ExportItem): string {
  return (it.seo?.title || it.email?.subject || it.guide?.title || it.infographic?.title || it.topic || "Материал").trim();
}
export const fileBase = (it: ExportItem) => slugify(titleOf(it)).slice(0, 60) || "material";

/* ───────── HTML → блоки ───────── */
export type Block = { t: "h1" | "h2" | "h3" | "p" | "li" | "quote"; text: string; md: string };

const inlineMd = (n: Node): string => {
  if (n instanceof TextNode) return n.text.replace(/\s+/g, " ");
  if (!(n instanceof HTMLElement)) return "";
  const inner = n.childNodes.map(inlineMd).join("");
  switch (n.tagName) {
    case "STRONG": case "B": return inner.trim() ? `**${inner.trim()}**` : inner;
    case "EM": case "I": return inner.trim() ? `*${inner.trim()}*` : inner;
    case "A": { const h = n.getAttribute("href"); return h && /^https?:/i.test(h) ? `[${inner.trim()}](${h})` : inner; }
    case "BR": return "\n";
    default: return inner;
  }
};
const inlineText = (n: Node): string => (n instanceof TextNode ? n.text.replace(/\s+/g, " ") : n instanceof HTMLElement ? (n.tagName === "BR" ? "\n" : n.childNodes.map(inlineText).join("")) : "");

export function htmlBlocks(html: string): Block[] {
  const out: Block[] = [];
  const push = (t: Block["t"], el: HTMLElement) => { const text = inlineText(el).trim(), md = inlineMd(el).trim(); if (text) out.push({ t, text, md }); };
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n instanceof TextNode) { const text = n.text.replace(/\s+/g, " ").trim(); if (text) out.push({ t: "p", text, md: text }); continue; }
      if (!(n instanceof HTMLElement)) continue;
      switch (n.tagName) {
        case "H1": push("h1", n); break;
        case "H2": push("h2", n); break;
        case "H3": case "H4": push("h3", n); break;
        case "P": push("p", n); break;
        case "BLOCKQUOTE": push("quote", n); break;
        case "UL": case "OL": n.querySelectorAll("li").forEach((li) => push("li", li)); break;
        case "TABLE": n.querySelectorAll("tr").forEach((tr) => { const cells = tr.querySelectorAll("th,td").map((c) => inlineText(c).trim()); if (cells.some(Boolean)) out.push({ t: "p", text: cells.join(" | "), md: cells.join(" | ") }); }); break;
        default: walk(n.childNodes);
      }
    }
  };
  walk(parse(html).childNodes);
  return out;
}

/* ───────── материал → текст / markdown / блоки ───────── */
/** Блоки материала в порядке чтения: для HTML-форматов из HTML, для остальных из текста и структур meta. */
export function blocksOf(it: ExportItem): Block[] {
  const p = (text: string): Block => ({ t: "p", text, md: text });
  const out: Block[] = [];
  if (isHtmlKind(it.kind)) {
    if (it.kind === "email" && it.email) { out.push({ t: "h1", text: it.email.subject, md: it.email.subject }); if (it.email.preheader) out.push(p(it.email.preheader)); if (it.email.headline) out.push({ t: "h2", text: it.email.headline, md: it.email.headline }); }
    else out.push({ t: "h1", text: titleOf(it), md: titleOf(it) });
    if (it.guide?.subtitle) out.push(p(it.guide.subtitle));
    if (it.kind === "seo" && it.seo?.description) out.push(p(it.seo.description));
    out.push(...htmlBlocks(it.body));
    if (it.kind === "email" && it.email?.cta) out.push(p(`Кнопка: ${it.email.cta}${it.email.ctaUrl ? ` (${it.email.ctaUrl})` : ""}`));
    return out;
  }
  if (it.kind === "poll" && it.poll) {
    if (it.body.trim()) out.push(p(it.body.trim()));
    out.push({ t: "h2", text: it.poll.question, md: it.poll.question });
    it.poll.options.forEach((o) => out.push({ t: "li", text: o, md: o }));
    return out;
  }
  if (it.kind === "infographic" && it.infographic) {
    out.push({ t: "h1", text: it.infographic.title, md: it.infographic.title });
    if (it.infographic.subtitle) out.push(p(it.infographic.subtitle));
    it.infographic.blocks.forEach((b) => out.push({ t: "li", text: `${b.head}${b.text ? `: ${b.text}` : ""}`, md: `**${b.head}**${b.text ? `: ${b.text}` : ""}` }));
    if (it.body.trim()) { out.push({ t: "h2", text: "Подпись к посту", md: "Подпись к посту" }); out.push(p(it.body.trim())); }
    return out;
  }
  if (it.kind === "carousel" && it.carousel) {
    if (it.body.trim()) { out.push({ t: "h2", text: "Подпись к посту", md: "Подпись к посту" }); it.body.trim().split(/\n{2,}/).forEach((x) => out.push(p(x))); }
    out.push({ t: "h2", text: "Слайды", md: "Слайды" });
    it.carousel.slides.forEach((s, i) => out.push({ t: "li", text: `Слайд ${i + 1}. ${s.title}${s.body ? `: ${s.body}` : ""}`, md: `**Слайд ${i + 1}.** ${s.title}${s.body ? `: ${s.body}` : ""}` }));
    return out;
  }
  // посты, статьи, сторис, конкурсы, сценарии: текст как есть, абзацы по пустым строкам; markdown-заголовки распознаём
  for (const para of it.body.replace(/\r/g, "").split(/\n{2,}/)) {
    const t = para.trim(); if (!t) continue;
    const h = /^(#{1,3})[ \t]+(.+)$/.exec(t);
    if (h && !t.includes("\n")) out.push({ t: h[1].length === 1 ? "h1" : h[1].length === 2 ? "h2" : "h3", text: h[2], md: h[2] });
    else out.push({ t: "p", text: t, md: t });
  }
  return out;
}

/** Обычный текст для вставки в соцсеть или редактор: без разметки, абзацы через пустую строку, пункты с «•». */
export function plainOf(it: ExportItem): string {
  // для постов и подобного отдаём исходный текст без изменений: автор мог выстроить его особым образом
  if (!isHtmlKind(it.kind) && !["poll", "infographic", "carousel"].includes(it.kind)) return it.body.trim();
  let out = "", prevLi = false;
  for (const x of blocksOf(it)) {
    const li = x.t === "li";
    out += `${out ? (li && prevLi ? "\n" : "\n\n") : ""}${li ? "• " : ""}${x.text}`;
    prevLi = li;
  }
  return out.trim();
}

export function markdownOf(it: ExportItem): string {
  if (!isHtmlKind(it.kind) && !["poll", "infographic", "carousel"].includes(it.kind)) return `# ${titleOf(it)}\n\n${it.body.trim()}\n`;
  const lines: string[] = [];
  let prevLi = false;
  for (const x of blocksOf(it)) {
    const li = x.t === "li";
    const pre = x.t === "h1" ? "# " : x.t === "h2" ? "## " : x.t === "h3" ? "### " : x.t === "quote" ? "> " : li ? "- " : "";
    lines.push(`${li && prevLi ? "" : "\n"}${pre}${x.md}`);
    prevLi = li;
  }
  return lines.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n") + "\n";
}

/* ───────── Word (.docx) без внешних библиотек ───────── */
const xe = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (text: string, bold = false) => text.split("\n").map((t, i) => `${i ? "<w:r><w:br/></w:r>" : ""}<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`).join("");

/** Минимальный docx: заголовки, абзацы, маркированные пункты, цитаты. Открывается в Word, Google Docs и LibreOffice. */
export async function docxOf(it: ExportItem): Promise<Uint8Array> {
  const body = blocksOf(it).map((b) => {
    if (b.t === "h1" || b.t === "h2" || b.t === "h3") return `<w:p><w:pPr><w:pStyle w:val="Heading${b.t === "h1" ? 1 : b.t === "h2" ? 2 : 3}"/></w:pPr>${run(b.text)}</w:p>`;
    if (b.t === "li") return `<w:p><w:pPr><w:ind w:left="540" w:hanging="270"/><w:spacing w:after="80"/></w:pPr>${run("• " + b.text)}</w:p>`;
    if (b.t === "quote") return `<w:p><w:pPr><w:ind w:left="540"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="999999"/></w:pBdr></w:pPr>${run(b.text)}</w:p>`;
    return `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr>${run(b.text)}</w:p>`;
  }).join("");
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  const style = (id: string, name: string, size: number) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="23"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${style("Heading1", "heading 1", 40)}${style("Heading2", "heading 2", 32)}${style("Heading3", "heading 3", 26)}</w:styles>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/* ───────── CSV для Excel ───────── */
export function csvCell(v: unknown): string { const s = String(v ?? "").replace(/\r/g, ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
/** UTF-8 с BOM и разделителем «;»: так русский Excel открывает файл без «кракозябр» и без ручного импорта. */
export const csvOf = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
