import sharp from "sharp";
import { resolveFont, withFont } from "./brand-font";
import { cleanText, fit, paths, widthOf } from "./text";
import { finalizeImage, type Kit } from "../images";
import type { AssetRow } from "../assets";

/** Слайд с уникальной картинкой от нейросети: фон растягиваем на слайд, текст набираем сами (кириллица всегда ровная), логотип кладём по настройкам бренда. */
export interface PhotoSlide {
  bg: Buffer; title: string; body: string; index: number; total: number; brandName: string;
  format: "portrait" | "square"; /** ширина готового файла, px */ width: number; font?: string; kit: Kit; logo: AssetRow | null;
  /** false — текст уже нарисовала модель: только кадрируем и добавляем логотип */ overlay: boolean;
}

const W = 1080, M = 80;

export async function composePhotoSlide(o: PhotoSlide): Promise<{ data: Buffer; mime: string; width: number; height: number }> {
  const H = o.format === "portrait" ? 1350 : 1080;
  const base = await sharp(o.bg, { limitInputPixels: 60_000_000 }).rotate().resize({ width: W, height: H, fit: "cover", position: "attention" }).png().toBuffer();
  let composed = base;
  if (o.overlay) {
    const svg = await withFont(await resolveFont(o.font || o.kit.font), async () => overlaySvg(o, H));
    composed = await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  }
  // логотип: по положению, размеру и отступу из набора бренда; «none» его убирает
  const placed = await finalizeImage(composed, o.logo, o.kit);
  if (o.width === W) return placed;
  const up = await sharp(placed.data).resize({ width: o.width, kernel: "lanczos3" }).sharpen({ sigma: 0.6 }).jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { data: up.data, mime: "image/jpeg", width: up.info.width, height: up.info.height };
}

function overlaySvg(o: PhotoSlide, H: number): string {
  const first = o.index === 0, last = o.index === o.total - 1 && o.total >= 3;
  const title = cleanText(o.title), body = cleanText(o.body);
  const logoBottom = !!o.logo && !!o.kit.logoPos && o.kit.logoPos !== "none" && o.kit.logoPos[0] === "b";
  const padB = logoBottom ? 210 : 120, innerW = W - 2 * M;
  const t = fit(title, 800, first ? { maxWidth: innerW, maxHeight: 420, maxSize: 104, minSize: 52, maxLines: 5, lh: 1.08 } : { maxWidth: innerW, maxHeight: 300, maxSize: 72, minSize: 40, maxLines: 4, lh: 1.1 });
  const b = body ? fit(body, 500, { maxWidth: innerW, maxHeight: first ? 130 : 250, maxSize: first ? 40 : 44, minSize: 26, maxLines: first ? 3 : 6, lh: 1.32 }) : null;
  const bh = b ? b.lines.length * b.lineHeight + 34 : 0, th = t.lines.length * t.lineHeight;
  const top = H - padB - bh - th;
  const anchor = last ? "middle" : "start", x = last ? W / 2 : M;
  // плавный тёмный низ: текст читается на любой картинке, верх остаётся чистым
  const shade = Math.min(H, th + bh + padB + 260);
  let g = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity=".62"/><stop offset="1" stop-color="#000" stop-opacity=".86"/></linearGradient></defs>`;
  g += `<rect x="0" y="${H - shade}" width="${W}" height="${shade}" fill="url(#s)"/>`;
  if (first) {
    const label = cleanText(o.brandName).slice(0, 26);
    if (label) { const lw = widthOf(label, 28, 800) + 44; g += `<rect x="${M}" y="${M}" width="${lw}" height="58" rx="29" fill="#fff" fill-opacity=".92"/>${paths([label], M + 22, M + 39, 28, 34, 800, "#14161a")}`; }
  } else {
    g += `<rect x="${M}" y="${M}" width="${widthOf(String(o.index + 1), 30, 800) + 52}" height="58" rx="29" fill="#000" fill-opacity=".45"/>${paths([`${o.index + 1}`], M + 26, M + 40, 30, 36, 800, "#fff")}`;
  }
  g += paths(t.lines, x, top + t.size * 0.9, t.size, t.lineHeight, 800, "#ffffff", anchor);
  if (b) g += `<g opacity=".9">${paths(b.lines, x, top + th + 34 + b.size * 0.9, b.size, b.lineHeight, 500, "#ffffff", anchor)}</g>`;
  if (first && !logoBottom) g += `<g opacity=".8">${paths(["Листайте"], M, H - 64, 30, 36, 500, "#fff")}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
