import { PublishError, type Provider } from "./types";
import { toPlain } from "./format";

/** credentials: token (ключ доступа сообщества, права «стена»), target (числовой id сообщества). */
const V = "5.199";
interface Vk<T> { response?: T; error?: { error_code: number; error_msg: string } }

async function call<T>(token: string, method: string, params: Record<string, string>): Promise<T> {
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

/** Загрузка фото на стену сообщества: адрес загрузки → файл → сохранение → attachment. */
async function uploadPhoto(token: string, groupId: string, img: { data: Buffer; mime: string }): Promise<string> {
  const srv = await call<{ upload_url: string }>(token, "photos.getWallUploadServer", { group_id: groupId });
  const f = new FormData();
  f.set("photo", new Blob([new Uint8Array(img.data)], { type: img.mime }), "image.jpg");
  let up: { server: number; photo: string; hash: string };
  try {
    const res = await fetch(srv.upload_url, { method: "POST", body: f, signal: AbortSignal.timeout(45_000) });
    up = (await res.json()) as typeof up;
  } catch (e) { throw new PublishError(`загрузка файла: ${(e as Error).message}`, true); }
  if (!up?.photo || !up.hash) throw new PublishError("VK не принял файл");
  const saved = await call<{ id: number; owner_id: number }[]>(token, "photos.saveWallPhoto", { group_id: groupId, server: String(up.server), photo: up.photo, hash: up.hash });
  if (!saved[0]) throw new PublishError("VK не сохранил фото");
  return `photo${saved[0].owner_id}_${saved[0].id}`;
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
    if (input.image) {
      try { attachment = await uploadPhoto(token, id, input.image); }
      catch (e) {
        if ((e as PublishError).retryable) throw e;
        warning = `Картинка не загружена (${(e as Error).message}), пост опубликован без неё. Проверьте, что у ключа сообщества есть право «фотографии»`;
      }
    }
    const r = await call<{ post_id: number }>(token, "wall.post", { owner_id: `-${id}`, from_group: "1", message: toPlain(input.text).slice(0, 15000), ...(attachment ? { attachments: attachment } : {}) });
    return { externalId: String(r.post_id), url: `https://vk.com/wall-${id}_${r.post_id}`, warning };
  },
};
