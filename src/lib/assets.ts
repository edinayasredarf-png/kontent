import sharp from "sharp";
import { one, q } from "./db";

export type AssetKind = "logo" | "product" | "reference" | "generated" | "studio";
export const LIMITS: Record<AssetKind, number> = { logo: 1, product: 12, reference: 12, generated: 1_000_000, studio: 1_000_000 };
export const ORG_QUOTA_BYTES = 150 * 1024 * 1024;
export const MAX_UPLOAD = 4 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;

export interface Processed { data: Buffer; mime: string; width: number; height: number }

/**
 * Любой загруженный файл перекодируется: так вырезаются метаданные (GPS в EXIF) и любые «подклеенные» данные, а файл,
 * который не картинка, отваливается ошибкой. SVG не принимается вовсе — в нём может быть скрипт.
 */
export async function processImage(input: Buffer, kind: AssetKind): Promise<Processed> {
  let img = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
  const meta = await img.metadata();
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new Error("Допустимы только JPG, PNG и WebP");
  const max = kind === "logo" ? 1200 : 2000;
  img = img.resize({ width: max, height: max, fit: "inside", withoutEnlargement: true });
  // логотип остаётся PNG с прозрачностью, остальное — JPEG
  if (kind === "logo") {
    const { data, info } = await img.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    return { data, mime: "image/png", width: info.width, height: info.height };
  }
  const { data, info } = await img.flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { data, mime: "image/jpeg", width: info.width, height: info.height };
}

export async function orgUsage(orgId: string): Promise<number> {
  return Number((await one<{ s: string }>("select coalesce(sum(size),0) s from kz_assets where org_id=$1", [orgId]))!.s);
}

export async function saveAsset(orgId: string, brandId: string | null, kind: AssetKind, name: string, p: Processed, note = ""): Promise<string> {
  if ((await orgUsage(orgId)) + p.data.length > ORG_QUOTA_BYTES) throw new Error("Достигнут лимит хранилища (150 МБ). Удалите ненужные картинки");
  if (brandId && kind !== "generated" && kind !== "studio") {
    if (kind === "logo") await q("delete from kz_assets where org_id=$1 and brand_id=$2 and kind='logo'", [orgId, brandId]); // логотип один: новый заменяет
    else {
      const n = Number((await one<{ n: string }>("select count(*) n from kz_assets where org_id=$1 and brand_id=$2 and kind=$3", [orgId, brandId, kind]))!.n);
      if (n >= LIMITS[kind]) throw new Error(`Не больше ${LIMITS[kind]} файлов этого типа на бренд`);
    }
  }
  const r = await one<{ id: string }>(
    `insert into kz_assets(org_id,brand_id,kind,name,mime,width,height,size,data,note) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [orgId, brandId, kind, name.slice(0, 120), p.mime, p.width, p.height, p.data.length, p.data, note]);
  return r!.id;
}

export interface AssetRow { id: string; kind: AssetKind; name: string; mime: string; width: number; height: number; size: number; note: string; data: Buffer }
export const loadAsset = (orgId: string, id: string) =>
  one<AssetRow>("select id,kind,name,mime,width,height,size,note,data from kz_assets where id=$1 and org_id=$2", [id, orgId]);

export const listAssets = (orgId: string, brandId: string) =>
  q<{ id: string; kind: AssetKind; name: string; width: number; height: number; note: string }>(
    "select id,kind,name,width,height,note from kz_assets where org_id=$1 and brand_id=$2 and kind<>'generated' order by created_at", [orgId, brandId]);
