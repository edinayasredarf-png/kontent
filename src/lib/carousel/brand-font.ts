import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import path from "node:path";
import opentype from "opentype.js";
import { FONT_CATALOG } from "../fonts-catalog";

/**
 * Фирменный шрифт для слайдов карусели и инфографики. Шрифт — из каталога (файлы woff лежат в public/fonts, латиница и кириллица отдельно)
 * или с Google Fonts (значение «gf:Название»: файл TTF скачивается с fonts.googleapis.com и кэшируется в памяти).
 * Любая неудача (нет файла, нет сети, в шрифте нет кириллицы) — тихий возврат к встроенному Inter: карусель не должна падать из-за шрифта.
 */
export type Pair = { latin: opentype.Font; cyr: opentype.Font };
export type FontSet = { 500: Pair; 800: Pair };

const store = new AsyncLocalStorage<FontSet>();
export const activeFont = (): FontSet | undefined => store.getStore();
export function withFont<T>(set: FontSet | null, fn: () => Promise<T>): Promise<T> { return set ? store.run(set, fn) : fn(); }

const parse = (b: Buffer) => opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const GF = /^gf:[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/;
export const isFontSpec = (s: unknown): s is string => typeof s === "string" && (GF.test(s) || FONT_CATALOG.some((f) => f.slug === s));

/** Файл шрифта: сначала с диска (public/fonts входит в сборку функции), затем с адреса сайта. */
async function readFont(file: string): Promise<Buffer> {
  try { return await readFile(path.join(process.cwd(), "public", "fonts", file)); } catch { /* на сервере файла нет — берём по сети */ }
  const base = process.env.APP_URL?.trim().replace(/\/+$/, "") || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (!base) throw new Error(`нет файла шрифта ${file}`);
  const r = await fetch(`${base}/fonts/${file}`, { signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`шрифт ${file}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function fromCatalog(slug: string): Promise<FontSet> {
  const f = FONT_CATALOG.find((x) => x.slug === slug);
  if (!f) throw new Error("шрифта нет в каталоге");
  const load = async (wt: number): Promise<Pair> => {
    const [lat, cyr] = await Promise.all(["latin", "cyrillic"].map((s) => readFont(`${slug}-${s}-${wt}.woff`)));
    return { latin: parse(lat), cyr: parse(cyr) };
  };
  const reg = f.weights.includes(400) ? 400 : f.weights[0], bold = f.weights.includes(700) ? 700 : reg;
  const [r, b] = await Promise.all([load(reg), bold === reg ? null : load(bold)]);
  return { 500: r, 800: b ?? r };
}

/** Google Fonts: CSS без user-agent браузера отдаёт TTF одним файлом на начертание (opentype.js не читает woff2). */
async function fromGoogle(name: string): Promise<FontSet> {
  const fam = encodeURIComponent(name).replace(/%20/g, "+");
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}:wght@400;700`, { headers: { "User-Agent": "curl/8.4.0" }, signal: AbortSignal.timeout(10_000) })).text();
  const urls = new Map<number, string>();
  for (const m of css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\(([^)]+)\)/g)) urls.set(Number(m[1]), m[2]);
  if (!urls.size) throw new Error("шрифт не найден в Google Fonts");
  const get = async (u: string) => {
    if (!/^https:\/\/fonts\.gstatic\.com\//.test(u)) throw new Error("неожиданный адрес файла шрифта");
    const r = await fetch(u, { signal: AbortSignal.timeout(15_000) });
    const b = Buffer.from(await r.arrayBuffer());
    if (!r.ok || b.length > 6_000_000) throw new Error("файл шрифта недоступен");
    return parse(b);
  };
  const reg = urls.get(400) ?? [...urls.values()][0], bold = urls.get(700) ?? reg;
  const [r, b] = await Promise.all([get(reg), bold === reg ? null : get(bold)]);
  // кириллицы в шрифте нет — для русского текста он бесполезен, откатываемся к Inter
  if (r.charToGlyph("Ж").index === 0) throw new Error("в шрифте нет кириллицы");
  const pair = (f: opentype.Font): Pair => ({ latin: f, cyr: f });
  return { 500: pair(r), 800: pair(b ?? r) };
}

const cache = new Map<string, Promise<FontSet | null>>();

/** Набор шрифтов по значению из фирменного набора бренда; null — использовать Inter. */
export function resolveFont(spec?: string | null): Promise<FontSet | null> {
  if (!spec || !isFontSpec(spec)) return Promise.resolve(null);
  let p = cache.get(spec);
  if (!p) {
    p = (spec.startsWith("gf:") ? fromGoogle(spec.slice(3)) : fromCatalog(spec)).catch((e) => { console.warn("[brand-font]", spec, (e as Error).message); cache.delete(spec); return null; });
    cache.set(spec, p);
  }
  return p;
}
