import sharp from "sharp";
import { cleanText, fit, paths, widthOf } from "./text";
import { decor, inkOn, lum, M, palette, prepLogo, W, type CarouselStyle, type Pal } from "./render";

export type InfoLayout = "steps" | "stats" | "checklist";
export interface Infographic { title: string; subtitle: string; layout: InfoLayout; blocks: { head: string; text: string }[] }
export const INFO_LAYOUTS: Record<InfoLayout, string> = { steps: "Шаги по порядку", stats: "Цифры", checklist: "Чек-лист" };

const H = 1350, INNER = W - 2 * M;

export function cleanInfographic(raw: unknown): Infographic | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const layout: InfoLayout = o.layout === "stats" || o.layout === "checklist" ? o.layout : "steps";
  const blocks = (Array.isArray(o.blocks) ? o.blocks : []).map((b) => ({ head: clip((b as Infographic["blocks"][0])?.head, 60), text: clip((b as Infographic["blocks"][0])?.text, 160) })).filter((b) => b.head).slice(0, layout === "stats" ? 4 : 6);
  const title = clip(o.title, 90);
  return title && blocks.length >= 2 ? { title, subtitle: clip(o.subtitle, 140), layout, blocks } : null;
}

/** Высота блока при масштабе k: заголовок + текст, перенос по ширине колонки. */
function measure(b: { head: string; text: string }, width: number, k: number, headSize: number, textSize: number) {
  const hs = Math.round(headSize * k), ts = Math.round(textSize * k);
  const h = fit(b.head, 800, { maxWidth: width, maxHeight: hs * 1.2 * 3, maxSize: hs, minSize: hs, maxLines: 3, lh: 1.15 });
  const t = b.text ? fit(b.text, 500, { maxWidth: width, maxHeight: ts * 1.3 * 5, maxSize: ts, minSize: ts, maxLines: 5, lh: 1.3 }) : null;
  return { h, t, height: h.lines.length * h.lineHeight + (t ? 10 + t.lines.length * t.lineHeight : 0) };
}

function body(info: Infographic, p: Pal, ink: string, top: number, bottom: number): string {
  const area = bottom - top;
  let g = "";
  if (info.layout === "stats") {
    const n = info.blocks.length, cols = n <= 2 ? 1 : 2, rows = Math.ceil(n / cols), gap = 28;
    const cw = (INNER - gap * (cols - 1)) / cols, ch = Math.min(380, (area - gap * (rows - 1)) / rows);
    info.blocks.forEach((b, i) => {
      const x = M + (i % cols) * (cw + gap), y = top + Math.floor(i / cols) * (ch + gap);
      const num = fit(b.head, 800, { maxWidth: cw - 60, maxHeight: ch * 0.45, maxSize: 120, minSize: 44, maxLines: 1, lh: 1 });
      const tx = b.text ? fit(b.text, 500, { maxWidth: cw - 60, maxHeight: ch - num.lineHeight - 70, maxSize: 34, minSize: 22, maxLines: 5, lh: 1.28 }) : null;
      g += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="34" fill="${ink}" fill-opacity=".08"/>`;
      g += paths(num.lines, x + 30, y + 36 + num.size * 0.86, num.size, num.lineHeight, 800, p.accent);
      if (tx) g += `<g opacity=".88">${paths(tx.lines, x + 30, y + 36 + num.lineHeight + 14 + tx.size * 0.9, tx.size, tx.lineHeight, 500, ink)}</g>`;
    });
    return g;
  }
  // шаги и чек-лист: колонка слева (кружок), текст справа; масштаб подбираем, чтобы всё поместилось
  const textW = INNER - 120, gap = 34;
  let k = 1, rowsM = info.blocks.map((b) => measure(b, textW, k, 46, 34));
  while (k > 0.55 && rowsM.reduce((a, r) => a + Math.max(r.height, 70), 0) + gap * (rowsM.length - 1) > area) { k -= 0.05; rowsM = info.blocks.map((b) => measure(b, textW, k, 46, 34)); }
  const total = rowsM.reduce((a, r) => a + Math.max(r.height, 70), 0) + gap * (rowsM.length - 1);
  let y = top + Math.max(0, (area - total) * 0.25);
  const lineX = M + 36;
  if (info.layout === "steps" && rowsM.length > 1) {
    const last = rowsM.slice(0, -1).reduce((a, r) => a + Math.max(r.height, 70) + gap, 0);
    g += `<rect x="${lineX - 3}" y="${y + 36}" width="6" height="${last}" rx="3" fill="${p.accent}" fill-opacity=".4"/>`;
  }
  rowsM.forEach((r, i) => {
    const rh = Math.max(r.height, 70), cy = y + 36;
    g += `<circle cx="${lineX}" cy="${cy}" r="36" fill="${p.accent}"/>`;
    g += info.layout === "steps"
      ? paths([String(i + 1)], lineX, cy + 17, 46, 50, 800, inkOn(p.accent), "middle")
      : `<path d="M${lineX - 15} ${cy + 1} l11 12 l20 -24" fill="none" stroke="${inkOn(p.accent)}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
    const x = M + 100, hy = y + (rh - r.height) / 2 + r.h.size * 0.9;
    g += paths(r.h.lines, x, hy, r.h.size, r.h.lineHeight, 800, ink);
    if (r.t) g += `<g opacity=".82">${paths(r.t.lines, x, hy + (r.h.lines.length - 1) * r.h.lineHeight + 10 + r.t.size * 0.95, r.t.size, r.t.lineHeight, 500, ink)}</g>`;
    y += rh + gap;
  });
  return g;
}

/** Одна картинка-инфографика 1080×1350: заголовок, подзаголовок, блоки выбранной раскладки, имя бренда и логотип. */
export async function renderInfographic(o: { info: Infographic; style: CarouselStyle; colors: { hex: string }[]; brandName: string; logo?: Buffer | null }): Promise<{ data: Buffer; mime: string; width: number; height: number }> {
  const p = palette(o.style, o.colors), ink = p.ink, logo = await prepLogo(o.logo);
  let g = decor(p, H, 0);
  const t = fit(o.info.title, 800, { maxWidth: INNER, maxHeight: 300, maxSize: 82, minSize: 46, maxLines: 4, lh: 1.1 });
  g += paths(t.lines, M, 130 + t.size * 0.9, t.size, t.lineHeight, 800, ink);
  let top = 130 + t.lines.length * t.lineHeight + 30;
  if (o.info.subtitle) {
    const s = fit(o.info.subtitle, 500, { maxWidth: INNER, maxHeight: 130, maxSize: 38, minSize: 26, maxLines: 3, lh: 1.3 });
    g += `<g opacity=".78">${paths(s.lines, M, top + s.size * 0.9, s.size, s.lineHeight, 500, ink)}</g>`;
    top += s.lines.length * s.lineHeight + 30;
  }
  g += body(o.info, p, ink, top + 20, H - 190);
  const name = cleanText(o.brandName).slice(0, 30);
  if (name) g += `<g opacity=".6">${paths([name], M, H - 84, 30, 36, 500, ink)}</g>`;
  if (logo) { const lx = W - M - logo.w, ly = H - M - logo.h; if (lum(p.bg) < 0.3) g += `<rect x="${lx - 18}" y="${ly - 14}" width="${logo.w + 36}" height="${logo.h + 28}" rx="20" fill="${p.chip}" fill-opacity=".94"/>`; g += `<image href="${logo.uri}" x="${lx}" y="${ly}" width="${logo.w}" height="${logo.h}"/>`; }
  void widthOf;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${p.bg}"/>${g}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { data, mime: "image/jpeg", width: info.width, height: info.height };
}
