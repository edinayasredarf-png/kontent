import { PublishError, type Provider } from "./types";
import sharp from "sharp";
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

type Img = { data: Buffer; mime: string };

/** Отправка файла на адрес загрузки VK (multipart). */
async function sendFile<T>(url: string, field: string, img: Img): Promise<T> {
  const f = new FormData();
  const ext = /png/.test(img.mime) ? "png" : /gif/.test(img.mime) ? "gif" : "jpg";
  f.set(field, new Blob([new Uint8Array(img.data)], { type: img.mime }), `image.${ext}`);
  try {
    const res = await fetch(url, { method: "POST", body: f, signal: AbortSignal.timeout(45_000) });
    const raw = await res.text();
    try { return JSON.parse(raw) as T; } catch { throw new PublishError(`ответ загрузки (${res.status}): ${raw.slice(0, 120)}`); }
  } catch (e) { if (e instanceof PublishError) throw e; throw new PublishError(`загрузка файла: ${(e as Error).message}`, true); }
}

/**
 * Способы загрузить картинку (по документации dev.vk.com). Методы «стена» и «альбом» доступны только ключу пользователя с особым правом,
 * ключу сообщества они отвечают кодом 27. Ключу сообщества разрешены серверы сообщений (право «Фотографии»): фото сохраняется как фото сообщества
 * и прикрепляется к посту; как запасной путь — файл через docs (право «Файлы»).
 */
const UPLOADERS: { name: string; multi: boolean; single?: boolean; run: (token: string, gid: string, img: Img, imageUrl?: string) => Promise<string> }[] = [
  { name: "стена", multi: true, run: async (token, gid, img) => {
    const srv = await call<{ upload_url: string }>(token, "photos.getWallUploadServer", { group_id: gid });
    const up = await sendFile<{ server: number; photo: string; hash: string }>(srv.upload_url, "photo", img);
    if (!up?.photo || !up.hash) throw new PublishError("VK не принял файл");
    const saved = await call<{ id: number; owner_id: number }[]>(token, "photos.saveWallPhoto", { group_id: gid, server: String(up.server), photo: up.photo, hash: up.hash });
    if (!saved[0]) throw new PublishError("VK не сохранил фото");
    return `photo${saved[0].owner_id}_${saved[0].id}`;
  } },
  { name: "файл", multi: false, run: async (token, gid, img) => {
    const srv = await call<{ upload_url: string }>(token, "docs.getWallUploadServer", { group_id: gid });
    const up = await sendFile<{ file?: string }>(srv.upload_url, "file", img);
    if (!up?.file) throw new PublishError(`VK не принял файл (ответ: ${JSON.stringify(up).slice(0, 120)})`);
    const saved = await call<{ type?: string; doc?: { id: number; owner_id: number; access_key?: string }; graffiti?: unknown } | { id: number; owner_id: number }[]>(token, "docs.save", { file: up.file, title: "image.jpg" });
    const d = Array.isArray(saved) ? saved[0] : (saved as { doc?: { id: number; owner_id: number; access_key?: string } }).doc;
    if (!d) throw new PublishError("VK не сохранил файл");
    return `doc${d.owner_id}_${d.id}${"access_key" in d && d.access_key ? `_${d.access_key}` : ""}`;
  } },
  // ключ сообщества: фото через «сообщения» VK принимает, но к посту на стене не показывает, поэтому сначала файл и карточка-ссылка; ссылка на страницу с картинкой — VK покажет её карточкой с крупным изображением (нужна публичная ссылка, APP_URL)
  { name: "ссылка с картинкой", multi: true, single: true, run: async (_t, _g, _i, imageUrl) => {
    if (!imageUrl) throw new PublishError("не задан APP_URL, публичной ссылки на картинку нет");
    return imageUrl.replace(/\/api\/pub\/([0-9a-f-]+)\?/i, "/api/pub/$1/card?");
  } },
  { name: "сообщения сообщества", multi: true, run: async (token, gid, img) => {
    const srv = await call<{ upload_url: string }>(token, "photos.getMessagesUploadServer", {});
    const up = await sendFile<{ server: number; photo: string; hash: string }>(srv.upload_url, "photo", img);
    if (!up?.photo || up.photo === "[]" || !up.hash) throw new PublishError(`VK не принял файл (ответ: ${JSON.stringify(up).slice(0, 120)})`);
    const saved = await call<{ id: number; owner_id: number; access_key?: string }[]>(token, "photos.saveMessagesPhoto", { server: String(up.server), photo: up.photo, hash: up.hash });
    if (!saved[0]) throw new PublishError("VK не сохранил фото");
    void gid;
    return `photo${saved[0].owner_id}_${saved[0].id}${saved[0].access_key ? `_${saved[0].access_key}` : ""}`;
  } },
];

/** Понятная причина, почему VK не принял фото: по каждому способу загрузки. */
function vkPhotoHint(errs: string[]): string {
  const all = errs.join(" | ");
  const tail = `Подробности: ${all}`;
  if (/код 5\)/.test(all)) return `ключ доступа недействителен или отозван. ${tail}`;
  if (/файл: [^|]*код 15/.test(all) && /сообщения сообщества: [^|]*не принял/.test(all)) return `ВК отказал и в фото, и в файле. В сообществе: Управление → Сообщения → включить; Управление → Разделы → «Файлы» (документы) → включить; в ключе отметьте «Фотографии», «Файлы» и «Сообщения». Если не помогает — ключ не подходит для загрузки, и нужен ключ пользователя-администратора. ${tail}`;
  if (/сообщения сообщества: [^|]*(код 15|код 27|код 200|код 7|Access denied|permission)/i.test(all)) return `у ключа сообщества не хватает прав для фото: отметьте «Фотографии» (и «Файлы») при создании ключа, а в сообществе включите сообщения (Управление → Сообщения). ${tail}`;
  if (/сообщения сообщества: [^|]*(код 9|901|messages)/i.test(all)) return `включите сообщения сообщества: Управление → Сообщения → «Включены». ${tail}`;
  return tail;
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
    const raw = input.images?.length ? input.images.slice(0, 10) : input.image ? [input.image] : [];
    // VK принимает только JPG, PNG и GIF; WebP и прочее он отбрасывает (пустой ответ загрузки), поэтому отправляем всё JPEG-ом
    const pics: Img[] = await Promise.all(raw.map(async (p) => /jpe?g/.test(p.mime) ? p : { data: await sharp(p.data).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer(), mime: "image/jpeg" }));
    const message = toPlain(input.text).slice(0, 15000);
    const post = async (attachment?: string) => call<{ post_id: number }>(token, "wall.post", { owner_id: `-${id}`, from_group: "1", message, ...(attachment ? { attachments: attachment } : {}) });
    const done = (r: { post_id: number }, warning?: string) => ({ externalId: String(r.post_id), url: `https://vk.com/wall-${id}_${r.post_id}`, warning });
    const errs: string[] = [];
    // пробуем способы по очереди; пост не публикуется, пока не подготовлено вложение, а ошибка вложения не теряет текст
    for (const up of UPLOADERS) {
      if (!pics.length) break;
      if (!up.multi && pics.length > 1) continue;
      try {
        const ids: string[] = [];
        // «single»: способ прикрепляет одну ссылку на всё (для карусели — на первый слайд)
        for (const pic of up.single ? pics.slice(0, 1) : pics) ids.push(await up.run(token, id, pic, input.imageUrl));
        const r = await post(ids.join(","));
        if (up.single) return done(r, pics.length > 1 ? `В VK ушла карточка только с первым слайдом из ${pics.length}: ключ сообщества не позволяет загрузить все. Для всех слайдов нужен ключ пользователя-администратора с правом photos.` : undefined);
        // VK может принять вложение и молча его отбросить: проверяем готовый пост, и если картинки нет — удаляем и пробуем другой способ
        let checkErr = "";
        const got = await call<{ items?: { attachments?: unknown[] }[] } | { attachments?: unknown[] }[]>(token, "wall.getById", { posts: `-${id}_${r.post_id}` }).catch((e: Error) => { checkErr = e.message; return null; });
        const list = Array.isArray(got) ? got : got?.items;
        if (checkErr || !list?.[0]) return done(r, `Картинка могла не попасть в пост: VK не даёт ключу сообщества проверить это, а фото, загруженные через сообщения, он часто не показывает. Чтобы картинка гарантированно была, задайте APP_URL на сервере (тогда она прикрепится ссылкой-карточкой) или подключите ключ пользователя-администратора. Способ: ${up.name}`);
        if (!(list[0].attachments?.length)) {
          await call(token, "wall.delete", { owner_id: `-${id}`, post_id: String(r.post_id) }).catch(() => null);
          throw new PublishError(`VK принял вложение ${ids.join(",")}, но в пост оно не попало`);
        }
        return done(r, up.single && pics.length > 1 ? `В VK ушла карточка только с первым слайдом из ${pics.length}: ключ сообщества не позволяет загрузить все. Для всех слайдов нужен ключ пользователя-администратора с правом photos.` : undefined);
      } catch (e) {
        if ((e as PublishError).retryable) throw e;
        errs.push(`${up.name}: ${(e as Error).message}`);
      }
    }
    const r = await post();
    return done(r, pics.length ? `${pics.length > 1 ? "Слайды не загружены" : "Картинка не загружена"}: ${vkPhotoHint(errs)}. Пост опубликован без ${pics.length > 1 ? "них" : "неё"}.` : undefined);
  },
};
