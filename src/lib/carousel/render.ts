import sharp from "sharp";
import { cleanText, fit, paths, widthOf } from "./text";
import { fixLayout, parseCompare, parseList, type SlideLayout } from "./layouts";

export interface Slide { title: string; body: string; layout?: SlideLayout }
export type CarouselStyle = "brand" | "light" | "dark";
export interface RenderOpts {
  slides: Slide[]; style: CarouselStyle; colors: { hex: string; name?: string }[]; brandName: string;
  aspect: "square" | "portrait"; logo?: Buffer | null; cover?: Buffer | null;
}

const W = 1080, M = 84;

/* ───────── цвет ───────── */
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** amount > 0 — светлее, < 0 — темнее. */
const shade = (h: string, a: number) => hex(rgb(h).map((v) => (a >= 0 ? v + (255 - v) * a : v * (1 + a))));
const inkOn = (bg: string) => (lum(bg) > 0.42 ? "#14161a" : "#ffffff");
const safeHex = (h?: string) => (h && /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null);

interface Pal { bg: string; ink: string; accent: string; ctaBg: string; ctaInk: string; chip: string }
export function palette(style: CarouselStyle, colors: { hex: string }[]): Pal {
  const c0 = safeHex(colors[0]?.hex) ?? "#029cda", c1 = safeHex(colors[1]?.hex);
  const readableAccent = (bg: string, a: string) => (Math.abs(lum(a) - lum(bg)) > 0.22 ? a : inkOn(bg));
  if (style === "dark") { const bg = "#0f1113"; return { bg, ink: "#f2f3f5", accent: readableAccent(bg, c1 ?? c0), ctaBg: c0, ctaInk: inkOn(c0), chip: "#ffffff" }; }
  if (style === "light") { const bg = "#f6f7f9"; return { bg, ink: "#14161a", accent: readableAccent(bg, c0), ctaBg: c0, ctaInk: inkOn(c0), chip: "#ffffff" }; }
  const bg = c0, ink = inkOn(bg);
  const cta = shade(c0, lum(c0) > 0.42 ? -0.55 : -0.45);
  return { bg, ink, accent: readableAccent(bg, c1 ?? (lum(bg) > 0.42 ? "#14161a" : "#ffffff")), ctaBg: cta, ctaInk: inkOn(cta), chip: "#ffffff" };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dataUri = (b: Buffer, mime: string) => `data:${mime};base64,${b.toString("base64")}`;

/* ───────── слайды ───────── */
async function prepLogo(logo: Buffer | null | undefined) {
  if (!logo) return null;
  try { const { data, info } = await sharp(logo).resize({ height: 64, width: 280, fit: "inside" }).png().toBuffer({ resolveWithObject: true }); return { uri: dataUri(data, "image/png"), w: info.width, h: info.height }; }
  catch { return null; } // битый логотип не должен ронять всю карусель
}

function decor(p: Pal, H: number, i: number): string {
  const a = p.accent;
  const x = i % 2 ? -120 : W + 80;
  return `<circle cx="${x}" cy="${i % 2 ? 220 : 160}" r="360" fill="${a}" fill-opacity=".10"/><circle cx="${i % 2 ? W + 40 : -40}" cy="${H - 120}" r="190" fill="${a}" fill-opacity=".08"/>`;
}

function footer(p: Pal, H: number, label: string, ink: string, logo: Awaited<ReturnType<typeof prepLogo>>, chipLogo: boolean): string {
  const y = H - 84;
  let out = `<g opacity=".6">${paths([label], M, y, 30, 36, 500, ink)}</g>`;
  if (logo) {
    const lx = W - M - logo.w, ly = H - M - logo.h;
    if (chipLogo) out += `<rect x="${lx - 18}" y="${ly - 14}" width="${logo.w + 36}" height="${logo.h + 28}" rx="20" fill="${p.chip}" fill-opacity=".94"/>`;
    out += `<image href="${logo.uri}" x="${lx}" y="${ly}" width="${logo.w}" height="${logo.h}"/>`;
  }
  return out;
}

/** Внутренние слайды с особым макетом: цифра, список, было/стало, цитата. Области считаются от высоты слайда, текст всегда помещается. */
function specialSlide(layout: SlideLayout, title: string, body: string, p: Pal, ink: string, H: number, bg: string): string {
  const innerW = W - 2 * M, top = 190, bottom = H - 170, area = bottom - top;
  let g = "";
  if (layout === "stat") {
    const t = fit(title, 800, { maxWidth: innerW, maxHeight: 300, maxSize: 260, minSize: 110, maxLines: 1, lh: 1 });
    const bd = fit(body, 500, { maxWidth: innerW, maxHeight: area - 340, maxSize: 58, minSize: 30, maxLines: 8, lh: 1.35 });
    const total = t.lineHeight + 50 + bd.lines.length * bd.lineHeight, y0 = top + Math.max(0, (area - total) * 0.4);
    g += paths(t.lines, M, y0 + t.size * 0.86, t.size, t.lineHeight, 800, p.accent);
    g += `<rect x="${M}" y="${y0 + t.lineHeight + 8}" width="120" height="8" rx="4" fill="${p.accent}"/>`;
    g += `<g opacity=".9">${paths(bd.lines, M, y0 + t.lineHeight + 50 + bd.size * 0.9, bd.size, bd.lineHeight, 500, ink)}</g>`;
  } else if (layout === "quote") {
    const q = fit(title, 800, { maxWidth: innerW, maxHeight: area - 330, maxSize: 76, minSize: 38, maxLines: 9, lh: 1.2 });
    const by = body ? fit(body, 500, { maxWidth: innerW, maxHeight: 130, maxSize: 40, minSize: 26, maxLines: 2, lh: 1.3 }) : null;
    const total = 200 + q.lines.length * q.lineHeight + (by ? 60 + by.lines.length * by.lineHeight : 0), y0 = top + Math.max(0, (area - total) * 0.35);
    g += `<g opacity=".95">${paths(["\u201C"], M - 6, y0 + 210, 330, 330, 800, p.accent)}</g>`;
    g += paths(q.lines, M, y0 + 190 + q.size * 0.9, q.size, q.lineHeight, 800, ink);
    if (by) g += `<rect x="${M}" y="${y0 + 190 + q.lines.length * q.lineHeight + 22}" width="80" height="6" rx="3" fill="${p.accent}"/><g opacity=".75">${paths(by.lines, M, y0 + 190 + q.lines.length * q.lineHeight + 60 + by.size * 0.9, by.size, by.lineHeight, 500, ink)}</g>`;
  } else {
    const t = fit(title, 800, { maxWidth: innerW, maxHeight: 220, maxSize: 70, minSize: 40, maxLines: 3, lh: 1.12 });
    g += paths(t.lines, M, top + t.size * 0.9, t.size, t.lineHeight, 800, ink);
    const y1 = top + t.lines.length * t.lineHeight + 50, room = bottom - y1;
    if (layout === "list") {
      const items = parseList(body), gap = 26, each = Math.min(190, (room - gap * (items.length - 1)) / items.length);
      items.forEach((it, k) => {
        const y = y1 + k * (each + gap), f = fit(it, 500, { maxWidth: innerW - 130, maxHeight: each - 16, maxSize: 46, minSize: 28, maxLines: 3, lh: 1.25 });
        g += `<rect x="${M}" y="${y}" width="${innerW}" height="${each}" rx="30" fill="${ink}" fill-opacity=".07"/>`;
        g += `<circle cx="${M + 56}" cy="${y + each / 2}" r="32" fill="${p.accent}"/>${paths([String(k + 1)], M + 56, y + each / 2 + 16, 44, 48, 800, inkOn(p.accent), "middle")}`;
        g += paths(f.lines, M + 118, y + (each - f.lines.length * f.lineHeight) / 2 + f.size * 0.88, f.size, f.lineHeight, 500, ink);
      });
    } else {
      const c = parseCompare(body)!, gap = 28, each = (room - gap) / 2;
      const card = (y: number, label: string, text: string, fill: string, fo: string, tc: string) => {
        const f = fit(text, 500, { maxWidth: innerW - 80, maxHeight: each - 130, maxSize: 48, minSize: 28, maxLines: 6, lh: 1.28 });
        return `<rect x="${M}" y="${y}" width="${innerW}" height="${each}" rx="34" fill="${fill}" fill-opacity="${fo}"/><g opacity=".7">${paths([label], M + 40, y + 70, 28, 32, 800, tc)}</g>${paths(f.lines, M + 40, y + 70 + 28 + f.size * 0.9, f.size, f.lineHeight, 500, tc)}`;
      };
      g += card(y1, c.a.label, c.a.text, ink, ".07", ink) + card(y1 + each + gap, c.b.label, c.b.text, p.accent, "1", inkOn(p.accent));
    }
  }
  void bg;
  return g;
}

async function slideSvg(o: RenderOpts, i: number, H: number, logo: Awaited<ReturnType<typeof prepLogo>>, p: Pal): Promise<string> {
  const n = o.slides.length, s = o.slides[i];
  const title = cleanText(s.title), body = cleanText(s.body);
  const innerW = W - 2 * M;
  const isCover = i === 0, isLast = i === n - 1 && n >= 3;
  const bg = isLast ? p.ctaBg : p.bg;
  const ink = isCover && o.cover ? "#ffffff" : isLast ? p.ctaInk : p.ink;
  let g = "";

  if (isCover) {
    if (o.cover) g += `<image href="${dataUri(o.cover, "image/jpeg")}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/><rect width="${W}" height="${H}" fill="url(#shade)"/>`;
    else g += decor(p, H, i);
    // подпись бренда плашкой
    const label = cleanText(o.brandName).slice(0, 28);
    if (label) { const lw = widthOf(label, 30, 800) + 48; g += `<rect x="${M}" y="${M}" width="${lw}" height="64" rx="32" fill="${o.cover ? "#ffffff" : p.accent}" fill-opacity="${o.cover ? ".92" : "1"}"/>${paths([label], M + 24, M + 43, 30, 36, 800, o.cover ? "#14161a" : inkOn(p.accent))}`; }
    const t = fit(title, 800, { maxWidth: innerW, maxHeight: H - 640, maxSize: 112, minSize: 56, maxLines: 7, lh: 1.08 });
    const sub = body ? fit(body, 500, { maxWidth: innerW, maxHeight: 150, maxSize: 40, minSize: 28, maxLines: 3, lh: 1.3 }) : null;
    const subH = sub ? sub.lines.length * sub.lineHeight + 52 : 0;
    const top = H - 250 - subH - t.lines.length * t.lineHeight;
    g += paths(t.lines, M, top + t.size * 0.92, t.size, t.lineHeight, 800, ink);
    if (sub) g += `<g opacity=".82">${paths(sub.lines, M, top + t.lines.length * t.lineHeight + 52 + sub.size * 0.9, sub.size, sub.lineHeight, 500, ink)}</g>`;
    // подсказка «листайте» со стрелкой
    const ay = H - 84, ax = M;
    g += `<g opacity=".75">${paths(["Листайте"], ax, ay, 32, 38, 500, ink)}<path d="M${ax + widthOf("Листайте", 32, 500) + 18} ${ay - 12} h34 m-12 -12 l12 12 l-12 12" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    if (logo) { const lx = W - M - logo.w, ly = H - M - logo.h; g += `<rect x="${lx - 18}" y="${ly - 14}" width="${logo.w + 36}" height="${logo.h + 28}" rx="20" fill="${p.chip}" fill-opacity=".94"/><image href="${logo.uri}" x="${lx}" y="${ly}" width="${logo.w}" height="${logo.h}"/>`; }
  } else if (isLast) {
    g += decor({ ...p, accent: p.ctaInk }, H, i);
    const t = fit(title, 800, { maxWidth: innerW, maxHeight: 420, maxSize: 92, minSize: 48, maxLines: 6, lh: 1.1 });
    const bd = body ? fit(body, 500, { maxWidth: innerW, maxHeight: H - 760, maxSize: 44, minSize: 28, maxLines: 8, lh: 1.35 }) : null;
    const total = t.lines.length * t.lineHeight + (bd ? 48 + bd.lines.length * bd.lineHeight : 0);
    const top = (H - 220 - total) / 2 + 40;
    g += paths(t.lines, W / 2, top + t.size * 0.92, t.size, t.lineHeight, 800, ink, "middle");
    if (bd) g += `<g opacity=".85">${paths(bd.lines, W / 2, top + t.lines.length * t.lineHeight + 48 + bd.size * 0.9, bd.size, bd.lineHeight, 500, ink, "middle")}</g>`;
    if (logo) { const lx = (W - logo.w) / 2, ly = H - M - logo.h; g += `<rect x="${lx - 22}" y="${ly - 16}" width="${logo.w + 44}" height="${logo.h + 32}" rx="22" fill="${p.chip}" fill-opacity=".95"/><image href="${logo.uri}" x="${lx}" y="${ly}" width="${logo.w}" height="${logo.h}"/>`; }
    else { const nm = cleanText(o.brandName).slice(0, 30); if (nm) g += `<g opacity=".8">${paths([nm], W / 2, H - 100, 36, 42, 800, ink, "middle")}</g>`; }
  } else if (fixLayout(s.layout, title, body, true) !== "text") {
    g += decor(p, H, i);
    g += specialSlide(fixLayout(s.layout, title, body, true), title, body, p, ink, H, bg);
    g += footer(p, H, `${i + 1} / ${n}`, ink, logo, lum(bg) < 0.3);
  } else {
    g += decor(p, H, i);
    g += `<g opacity=".95">${paths([String(i).padStart(2, "0")], M, 250, 150, 150, 800, p.accent)}</g>`;
    const t = fit(title, 800, { maxWidth: innerW, maxHeight: 360, maxSize: 78, minSize: 44, maxLines: 4, lh: 1.12 });
    const titleH = t.lines.length * t.lineHeight;
    const bd = body ? fit(body, 500, { maxWidth: innerW, maxHeight: H - 200 - (330 + titleH + 44), maxSize: 54, minSize: 30, maxLines: 14, lh: 1.38 }) : null;
    // свободное место внизу делим: блок смещается вниз на треть остатка, чтобы слайд не выглядел «приклеенным» к верху
    const free = Math.max(0, H - 200 - 330 - titleH - (bd ? 44 + bd.lines.length * bd.lineHeight : 0));
    const top = 330 + free * 0.33;
    g += paths(t.lines, M, top + t.size * 0.9, t.size, t.lineHeight, 800, ink);
    if (bd) g += `<g opacity=".88">${paths(bd.lines, M, top + titleH + 44 + bd.size * 0.9, bd.size, bd.lineHeight, 500, ink)}</g>`;
    g += footer(p, H, `${i + 1} / ${n}`, ink, logo, lum(bg) < 0.3);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".78"/></linearGradient></defs><rect width="${W}" height="${H}" fill="${bg}"/>${g}</svg>`;
}

/** Рисует все слайды карусели. Возвращает JPEG-файлы по порядку. */
export async function renderCarousel(o: RenderOpts): Promise<{ data: Buffer; mime: string; width: number; height: number }[]> {
  if (o.slides.length < 2) throw new Error("В карусели должно быть минимум 2 слайда");
  const H = o.aspect === "portrait" ? 1350 : 1080;
  const p = palette(o.style, o.colors), logo = await prepLogo(o.logo);
  const out = [];
  for (let i = 0; i < o.slides.length; i++) {
    const svg = await slideSvg(o, i, H, logo, p);
    const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    out.push({ data, mime: "image/jpeg", width: info.width, height: info.height });
  }
  return out;
}
