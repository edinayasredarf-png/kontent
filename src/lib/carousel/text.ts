import opentype from "opentype.js";
import { INTER_CYRILLIC_500, INTER_CYRILLIC_800, INTER_LATIN_500, INTER_LATIN_800 } from "./fonts";

/**
 * Текст на слайдах набираем сами и отдаём в SVG готовыми контурами (path): так не нужны системные шрифты (на Vercel их нет),
 * а кириллица не искажается, как у нейросетей. Шрифт Inter: латиница и кириллица — отдельные файлы, символ берём из того, где он есть.
 */
export type Weight = 500 | 800;
type Pair = { latin: opentype.Font; cyr: opentype.Font };
const cache = new Map<Weight, Pair>();

function parse(b64: string): opentype.Font {
  const buf = Buffer.from(b64, "base64");
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
function fonts(w: Weight): Pair {
  let p = cache.get(w);
  if (!p) { p = w === 800 ? { latin: parse(INTER_LATIN_800), cyr: parse(INTER_CYRILLIC_800) } : { latin: parse(INTER_LATIN_500), cyr: parse(INTER_CYRILLIC_500) }; cache.set(w, p); }
  return p;
}

/** Убираем то, чего шрифт нарисовать не может (эмодзи, управляющие символы), и нормализуем пробелы и типографику. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/ /g, " ").replace(/[“”«»„]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

function glyphOf(ch: string, w: Weight): { font: opentype.Font; glyph: opentype.Glyph } {
  const f = fonts(w);
  const cyr = f.cyr.charToGlyph(ch), lat = f.latin.charToGlyph(ch);
  if (/[Ѐ-ӿ]/.test(ch) && cyr.index !== 0) return { font: f.cyr, glyph: cyr };
  if (lat.index !== 0) return { font: f.latin, glyph: lat };
  if (cyr.index !== 0) return { font: f.cyr, glyph: cyr };
  return { font: f.latin, glyph: f.latin.charToGlyph("?") }; // неизвестный символ — вопрос, а не «пустая коробка»
}

export function widthOf(text: string, size: number, w: Weight): number {
  let x = 0;
  for (const ch of text) { const { font, glyph } = glyphOf(ch, w); x += ((glyph.advanceWidth ?? 0) * size) / font.unitsPerEm; }
  return x;
}

/** Перенос по словам; слово шире строки режем по символам. */
export function wrap(text: string, size: number, w: Weight, maxWidth: number): string[] {
  const lines: string[] = []; let cur = "";
  const push = () => { if (cur) lines.push(cur); cur = ""; };
  for (const word of cleanText(text).split(" ").filter(Boolean)) {
    const tryLine = cur ? `${cur} ${word}` : word;
    if (widthOf(tryLine, size, w) <= maxWidth) { cur = tryLine; continue; }
    push();
    if (widthOf(word, size, w) <= maxWidth) { cur = word; continue; }
    for (const ch of word) { if (widthOf(cur + ch, size, w) > maxWidth) push(); cur += ch; }
  }
  push();
  return lines;
}

export interface Fit { lines: string[]; size: number; lineHeight: number }

/** Подбирает наибольший размер шрифта (от max до min), при котором текст укладывается в maxLines строк и maxHeight. Не помещается даже на min — обрезаем с «…». */
export function fit(text: string, w: Weight, o: { maxWidth: number; maxHeight: number; maxSize: number; minSize: number; maxLines?: number; lh?: number }): Fit {
  const lh = o.lh ?? 1.18;
  for (let size = o.maxSize; size >= o.minSize; size -= 2) {
    const lines = wrap(text, size, w, o.maxWidth);
    if (lines.length * size * lh <= o.maxHeight && (!o.maxLines || lines.length <= o.maxLines)) return { lines, size, lineHeight: size * lh };
  }
  const size = o.minSize;
  let lines = wrap(text, size, w, o.maxWidth);
  const cap = Math.max(1, Math.min(o.maxLines ?? 99, Math.floor(o.maxHeight / (size * lh))));
  if (lines.length > cap) { lines = lines.slice(0, cap); let last = lines[cap - 1]; while (last.length > 1 && widthOf(last + "…", size, w) > o.maxWidth) last = last.slice(0, -1); lines[cap - 1] = last.replace(/[\s.,;:—-]+$/, "") + "…"; }
  return { lines, size, lineHeight: size * lh };
}

/** SVG-контуры строк. y — базовая линия первой строки. anchor: start | middle. */
export function paths(lines: string[], x: number, y: number, size: number, lineHeight: number, w: Weight, fill: string, anchor: "start" | "middle" = "start"): string {
  let out = "";
  lines.forEach((line, i) => {
    let cx = anchor === "middle" ? x - widthOf(line, size, w) / 2 : x;
    const base = y + i * lineHeight;
    let d = "";
    for (const ch of line) {
      const { font, glyph } = glyphOf(ch, w);
      if (ch !== " ") d += glyph.getPath(cx, base, (size * font.unitsPerEm) / font.unitsPerEm).toPathData(2);
      cx += ((glyph.advanceWidth ?? 0) * size) / font.unitsPerEm;
    }
    out += `<path d="${d}" fill="${fill}"/>`;
  });
  return out;
}
