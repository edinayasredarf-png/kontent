import sharp from "sharp";
import { one, q } from "./db";
import { safeFetchBuffer } from "./safefetch";

export const AVATAR_SIZE = 256;
export const MAX_AVATAR_UPLOAD = 6 * 1024 * 1024;
export type AvatarSource = "upload" | "yandex" | "vk";

/** Квадрат 256×256 в webp: обрезка по центру, поворот по EXIF. Битый или слишком большой файл — понятная ошибка. */
export async function processAvatar(input: Buffer): Promise<Buffer> {
  if (input.length > MAX_AVATAR_UPLOAD) throw new Error("Файл больше 6 МБ");
  try {
    const meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    if (!meta.width || !meta.height) throw new Error("bad");
    return await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" }).webp({ quality: 86 }).toBuffer();
  } catch { throw new Error("Файл не похож на изображение или слишком большой"); }
}

export async function saveAvatar(userId: string, input: Buffer, source: AvatarSource): Promise<void> {
  const data = await processAvatar(input);
  await q(`insert into kz_user_avatars(user_id,mime,data,source) values($1,'image/webp',$2,$3)
           on conflict(user_id) do update set mime='image/webp',data=$2,source=$3,updated_at=now()`, [userId, data, source]);
}

export async function deleteAvatar(userId: string): Promise<void> { await q("delete from kz_user_avatars where user_id=$1", [userId]); }

export async function loadAvatar(userId: string): Promise<{ data: Buffer; mime: string } | null> {
  return one<{ data: Buffer; mime: string }>("select data,mime from kz_user_avatars where user_id=$1", [userId]);
}

/** Адрес картинки, на который мы согласны ходить за аватаркой: только https и только известные CDN Яндекса и VK. */
export function avatarUrlAllowed(raw: string, provider: "yandex" | "vk"): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  const ok = (d: string) => h === d || h.endsWith(`.${d}`);
  return provider === "yandex" ? ["avatars.yandex.net", "avatars.mds.yandex.net"].some(ok) : ["userapi.com", "vk.com", "vk.ru", "vkuserphoto.ru", "vk-cdn.net", "mycdn.me", "vkontakte.ru"].some(ok);
}

/**
 * Аватарка из профиля Яндекса/VK при входе. Свою загруженную картинку не трогаем; сбой (нет сети, не картинка) на вход не влияет.
 * allowAny — только для тестов (адрес локального сервера).
 */
export async function importProviderAvatar(userId: string, provider: "yandex" | "vk", url: string | null | undefined, allowAny = false): Promise<boolean> {
  try {
    if (!url || (!allowAny && !avatarUrlAllowed(url, provider))) return false;
    const cur = await one<{ source: string }>("select source from kz_user_avatars where user_id=$1", [userId]);
    if (cur?.source === "upload") return false;
    const f = await Promise.race([safeFetchBuffer(url, 3_000_000), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("таймаут")), 6000))]);
    await saveAvatar(userId, f.data, provider);
    return true;
  } catch (e) { console.warn("[avatar]", provider, (e as Error).message.slice(0, 120)); return false; }
}
