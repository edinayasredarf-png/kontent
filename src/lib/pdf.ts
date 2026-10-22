import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { blocksOf, titleOf, type ExportItem } from "./exporter";

/**
 * PDF гайда и других документов: A4, обложка с цветом бренда, заголовки, абзацы, списки, цитаты, колонтитул с номером страницы.
 * Шрифт PT Sans (SIL OFL) с кириллицей лежит в public/fonts/pdf. Символы, которых в шрифте нет (эмодзи и т. п.), вместо квадратиков пропускаются.
 */
const A4 = { w: 595.28, h: 841.89 }, M = { x: 62, top: 64, bottom: 64 };

async function loadFont(name: string): Promise<Uint8Array> {
  const file = path.join(process.cwd(), "public", "fonts", "pdf", name);
  try { return await readFile(file); } catch { /* на сервере файла нет: берём с адреса сайта */ }
  const base = process.env.APP_URL?.trim().replace(/\/+$/, "") || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (!base) throw new Error(`Нет файла шрифта ${name}`);
  const r = await fetch(`${base}/fonts/pdf/${name}`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Шрифт ${name}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

const hexRgb = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); const n = m ? parseInt(m[1], 16) : 0x029cda; return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

export async function pdfOf(it: ExportItem, brand: { name: string; color: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [reg, bold] = await Promise.all([loadFont("PTSans-400.ttf"), loadFont("PTSans-700.ttf")]);
  const F: { r: PDFFont; b: PDFFont } = { r: await doc.embedFont(reg, { subset: false }), b: await doc.embedFont(bold, { subset: false }) };
  const ok = new Set(F.r.getCharacterSet());
  const clean = (s: string) => [...s.replace(/ /g, " ").replace(/[​-‏️]/g, "")].filter((ch) => ok.has(ch.codePointAt(0)!) || ch === "\n").join("");
  const color = hexRgb(brand.color), ink = rgb(0.11, 0.12, 0.14), soft = rgb(0.42, 0.45, 0.5);
  const title = clean(titleOf(it)) || "Документ";
  const blocks = blocksOf(it);
  const subtitle = clean(it.guide?.subtitle ?? "");
  const innerW = A4.w - M.x * 2;

  doc.setTitle(title); doc.setAuthor(brand.name); doc.setCreator("Контент-завод"); doc.setLanguage("ru-RU");

  /* обложка */
  const cover = doc.addPage([A4.w, A4.h]);
  cover.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color });
  cover.drawRectangle({ x: 0, y: 0, width: A4.w, height: 120, color: rgb(0, 0, 0), opacity: 0.12 });
  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let cur = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        // слово шире строки режем по символам, чтобы длинная ссылка не вылезала за поля
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) { let k = w.length; while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--; if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, k)); w = w.slice(k); }
        const next = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) <= width) cur = next; else { if (cur) lines.push(cur); cur = w; }
      }
      lines.push(cur);
    }
    return lines;
  };
  const light = rgb(1, 1, 1);
  const lum = (0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue);
  const onColor = lum > 0.62 ? rgb(0.08, 0.09, 0.11) : light;
  let y = A4.h - 220;
  for (const line of wrap(title, F.b, 34, innerW)) { cover.drawText(line, { x: M.x, y, size: 34, font: F.b, color: onColor }); y -= 42; }
  if (subtitle) { y -= 10; for (const line of wrap(subtitle, F.r, 16, innerW)) { cover.drawText(line, { x: M.x, y, size: 16, font: F.r, color: onColor, opacity: 0.9 }); y -= 22; } }
  cover.drawText(clean(brand.name), { x: M.x, y: 62, size: 15, font: F.b, color: onColor });
  cover.drawText(new Date().toLocaleDateString("ru-RU", { year: "numeric", month: "long" }), { x: M.x, y: 42, size: 11, font: F.r, color: onColor, opacity: 0.85 });

  /* текст */
  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let cy = A4.h - M.top;
  const room = (need: number) => { if (cy - need < M.bottom) { page = doc.addPage([A4.w, A4.h]); cy = A4.h - M.top; } };
  const skipTitle = blocks[0]?.t === "h1" && clean(blocks[0].text) === title; // заголовок уже на обложке
  const body = blocks.slice(skipTitle ? 1 : 0).filter((b) => !(b.t === "p" && subtitle && clean(b.text) === subtitle));
  for (const b of body) {
    const text = clean(b.text).trim();
    if (!text) continue;
    if (b.t === "h1" || b.t === "h2" || b.t === "h3") {
      const size = b.t === "h1" ? 24 : b.t === "h2" ? 19 : 15, lh = size * 1.28;
      const lines = wrap(text, F.b, size, innerW);
      room(lines.length * lh + 28 + 36); // заголовок не остаётся один внизу страницы
      cy -= b.t === "h2" ? 14 : 8;
      if (b.t === "h2") page.drawRectangle({ x: M.x, y: cy + size * 0.2 - 6, width: 36, height: 3, color });
      for (const l of lines) { cy -= lh; page.drawText(l, { x: M.x, y: cy, size, font: F.b, color: b.t === "h3" ? ink : ink }); }
      cy -= 8;
    } else if (b.t === "li") {
      const lines = wrap(text, F.r, 11.5, innerW - 20);
      for (const [i, l] of lines.entries()) { room(17); cy -= 16.5; if (i === 0) page.drawCircle({ x: M.x + 6, y: cy + 4, size: 2.2, color }); page.drawText(l, { x: M.x + 20, y: cy, size: 11.5, font: F.r, color: ink }); }
      cy -= 4;
    } else if (b.t === "quote") {
      const lines = wrap(text, F.r, 12, innerW - 24);
      room(lines.length * 17 + 10);
      const top = cy; cy -= 6;
      for (const l of lines) { cy -= 17; page.drawText(l, { x: M.x + 16, y: cy, size: 12, font: F.r, color: soft }); }
      page.drawRectangle({ x: M.x, y: cy - 4, width: 3, height: top - cy + 2, color });
      cy -= 12;
    } else {
      const lines = wrap(text, F.r, 11.5, innerW);
      for (const l of lines) { room(17); cy -= 16.5; page.drawText(l, { x: M.x, y: cy, size: 11.5, font: F.r, color: ink }); }
      cy -= 9;
    }
  }

  /* колонтитул со страницами (кроме обложки) */
  const pages = doc.getPages();
  pages.slice(1).forEach((p, i) => {
    p.drawLine({ start: { x: M.x, y: 44 }, end: { x: A4.w - M.x, y: 44 }, thickness: 0.5, color: rgb(0.85, 0.87, 0.9) });
    p.drawText(clean(brand.name), { x: M.x, y: 30, size: 9, font: F.r, color: soft });
    const n = `${i + 1}`; p.drawText(n, { x: A4.w - M.x - F.r.widthOfTextAtSize(n, 9), y: 30, size: 9, font: F.r, color: soft });
  });
  return doc.save();
}
