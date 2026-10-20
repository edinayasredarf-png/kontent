import { PublishError, type Provider } from "./types";
import { toPlain } from "./format";

/** credentials: token (ключ доступа сообщества, права «стена»), target (числовой id сообщества). */
const V = "5.199";
interface Vk<T> { response?: T; error?: { error_code: number; error_msg: string } }

export async function call<T>(token: string, method: string, params: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    // токен — в теле POST, а не в URL: URL попадает в логи
    res = await fetch(`${(process.env.VK_API_BASE?.trim() || "https://api.vk.com").replace(/\/+$/, "")}/method/${method}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, access_token: token, v: V }), signal: AbortSignal.timeout(20_000),
    });
  } catch (e) { throw new PublishError(`VK недоступен: ${(e as Error).message}`, true); }
  const j = (await res.json().catch(() => ({}))) as Vk<T>;
  if (j.error) {
    const c = j.error.error_code;
    // 6 — частота запросов, 9 — флуд-контроль, 10 — внутренняя ошибка VK
    throw new PublishError(`VK ${method}: ${j.error.error_msg} (код ${c})`, c === 6 || c === 9 || c === 10);
  }
  if (j.response === undefined) throw new PublishError(`VK ${method}: пустой ответ`, res.status >= 500);
  return j.response;
}

const need = (c: Record<string, string>) => {
  const id = (c.target ?? "").trim().replace(/^-/, "");
  if (!c.token || !/^\d+$/.test(id)) throw new PublishError("Для VK нужны ключ доступа сообщества и числовой id сообщества");
  return { token: c.token, id };
};

const ALBUM_TITLE = "Контент-завод";

/** Выбор альбома сообщества для картинок: наш (создаём при первой публикации), иначе любой существующий. */
async function communityAlbum(token: string, groupId: string): Promise<number> {
  const list = await call<{ items?: { id: number; title: string }[] }>(token, "photos.getAlbums", { owner_id: `-${groupId}` });
  const items = list.items ?? [];
  const mine = items.find((x) => x.title === ALBUM_TITLE);
  if (mine) return mine.id;
  try {
    const made = await call<{ id: number }>(token, "photos.createAlbum", { title: ALBUM_TITLE, group_id: groupId, description: "Картинки к постам" });
    return made.id;
  } catch (e) {
    if (items[0]) return items[0].id;
    throw new PublishError(`не удалось создать альбом для картинок (${(e as Error).message}). Создайте в сообществе любой фотоальбом и опубликуйте снова`);
  }
}

/** Отправка файла на адрес загрузки VK (multipart). */
async function sendFile<T>(url: string, field: string, img: { data: Buffer; mime: string }): Promise<T> {
  const f = new FormData();
  f.set(field, new Blob([new Uint8Array(img.data)], { type: img.mime }), "image.jpg");
  try {
    const res = await fetch(url, { method: "POST", body: f, signal: AbortSignal.timeout(45_000) });
    return (await res.json()) as T;
  } catch (e) { throw new PublishError(`загрузка файла: ${(e as Error).message}`, true); }
}

/**
 * Загрузка фото для поста. Сначала «стена» (работает с ключом пользователя); VK не пускает к ней ключ сообщества (код 27),
 * поэтому тогда картинка загружается в альбом сообщества и прикрепляется к посту оттуда — так делают все боты сообществ.
 */
async function uploadPhoto(token: string, groupId: string, img: { data: Buffer; mime: string }): Promise<string> {
  try {
    const srv = await call<{ upload_url: string }>(token, "photos.getWallUploadServer", { group_id: groupId });
    const up = await sendFile<{ server: number; photo: string; hash: string }>(srv.upload_url, "photo", img);
    if (!up?.photo || !up.hash) throw new PublishError("VK не принял файл");
    const saved = await call<{ id: number; owner_id: number }[]>(token, "photos.saveWallPhoto", { group_id: groupId, server: String(up.server), photo: up.photo, hash: up.hash });
    if (!saved[0]) throw new PublishError("VK не сохранил фото");
    return `photo${saved[0].owner_id}_${saved[0].id}`;
  } catch (e) {
    if (!/код 27\)/.test((e as Error).message)) throw e;
  }
  // путь для ключа сообщества: альбом
  const album = await communityAlbum(token, groupId);
  const srv = await call<{ upload_url: string }>(token, "photos.getUploadServer", { album_id: String(album), group_id: groupId });
  const up = await sendFile<{ server: number; photos_list: string; hash: string }>(srv.upload_url, "file1", img);
  if (!up?.photos_list || up.photos_list === "[]" || !up.hash) throw new PublishError("VK не принял файл");
  const saved = await call<{ id: number; owner_id: number }[]>(token, "photos.save", { album_id: String(album), group_id: groupId, server: String(up.server), photos_list: up.photos_list, hash: up.hash });
  if (!saved[0]) throw new PublishError("VK не сохранил фото");
  return `photo${saved[0].owner_id}_${saved[0].id}`;
}

/** Понятная причина, почему VK не принял фото. Чаще всего у ключа сообщества нет права «Фотографии». */
function vkPhotoHint(msg: string): string {
  const code = Number(/\(код (\d+)\)/.exec(msg)?.[1] ?? 0);
  if (code === 27 || /unavailable with group auth/i.test(msg)) return `VK не разрешает этот метод с ключом сообщества (${msg})`;
  if ([15, 200, 203, 7].includes(code) || /access denied|permission/i.test(msg))
    return `у ключа сообщества не хватает прав для фото (${msg}). Проверьте, что в ключе отмечены «Стена» и «Фотографии», при необходимости создайте новый и замените его в разделе «Каналы»`;
  if (code === 5) return `ключ доступа недействителен или отозван (${msg}). Создайте новый ключ и замените его в разделе «Каналы»`;
  if (/VK не принял файл/.test(msg)) return "VK отклонил файл изображения (формат или размер). Попробуйте другое изображение: JPG или PNG до 4 МБ";
  return msg;
}

export const vk: Provider = {
  kind: "vk",
  async verify(c) {
    const { token, id } = need(c);
    const g = await call<{ groups?: { name: string }[] } | { name: string }[]>(token, "groups.getById", { group_id: id });
    const name = Array.isArray(g) ? g[0]?.name : g.groups?.[0]?.name;
    if (!name) throw new PublishError("Сообщество не найдено — проверьте id");
    return name;
  },
  async publish(input, c) {
    const { token, id } = need(c);
    let attachment: string | undefined, warning: string | undefined;
    const pics = input.images?.length ? input.images.slice(0, 10) : input.image ? [input.image] : [];
    if (pics.length) {
      try { const ids: string[] = []; for (const pic of pics) ids.push(await uploadPhoto(token, id, pic)); attachment = ids.join(","); }
      catch (e) {
        if ((e as PublishError).retryable) throw e;
        warning = `${pics.length > 1 ? "Слайды не загружены" : "Картинка не загружена"}: ${vkPhotoHint((e as Error).message)}. Пост опубликован без ${pics.length > 1 ? "них" : "неё"}.`;
      }
    }
    const r = await call<{ post_id: number }>(token, "wall.post", { owner_id: `-${id}`, from_group: "1", message: toPlain(input.text).slice(0, 15000), ...(attachment ? { attachments: attachment } : {}) });
    return { externalId: String(r.post_id), url: `https://vk.com/wall-${id}_${r.post_id}`, warning };
  },
};
