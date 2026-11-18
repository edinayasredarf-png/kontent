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

class UncertainPostError extends PublishError {}

type Img = { data: Buffer; mime: string };

/** Отправка файла на адрес загрузки VK (multipart). */
async function sendFile<T>(url: string, field: string, img: Img): Promise<T> {
  const f = new FormData();
  const ext = /png/.test(img.mime) ? "png" : /gif/.test(img.mime) ? "gif" : "jpg";
  f.set(field, new Blob([new Uint8Array(img.data)], { type: img.mime }), `image.${ext}`);
  // сервер загрузки VK иногда отвечает не JSON-ом, а страницей ошибки (например, 405 от шлюза): один повтор обычно проходит
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", body: f, signal: AbortSignal.timeout(45_000) });
      const raw = await res.text();
      try { return JSON.parse(raw) as T; } catch { throw new PublishError(`ответ загрузки (${res.status}): ${raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}`); }
    } catch (e) {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      if (e instanceof PublishError) throw e;
      throw new PublishError(`загрузка файла: ${(e as Error).message}`, true);
    }
  }
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
    const saved = await call<{ id: number; owner_id: number; access_key?: string }[]>(token, "photos.saveWallPhoto", { group_id: gid, server: String(up.server), photo: up.photo, hash: up.hash });
    if (!saved[0]) throw new PublishError("VK не сохранил фото");
    return `photo${saved[0].owner_id}_${saved[0].id}${saved[0].access_key ? `_${saved[0].access_key}` : ""}`;
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

/** Translate VK key errors without confusing app, group and user credentials. */
export function vkPhotoAccessError(error: unknown): string {
  const message = (error as Error).message || "VK не подтвердил доступ";
  if (/код 27\)/.test(message)) return "В это поле введён ключ сообщества. Для фотографий нужен ключ пользователя — администратора сообщества, полученный с разрешениями photos и wall. Кнопка «Подключить VK» запрашивает доступ через аккаунт VK. Сервисный и защищённый ключи приложения сюда не подходят.";
  if (/код (15|7|200|1051)\)/.test(message)) return "VK не разрешает этому ключу загружать фото на стену. Проверьте права photos и wall, права администратора сообщества и разрешения приложения VK.";
  if (/код 5\)/.test(message)) return "VK отклонил ключ — он истёк или отозван. Подключите VK заново или сохраните действующий ключ пользователя.";
  return message;
}

export const vk: Provider = {
  kind: "vk",
  async verify(c) {
    const { token, id } = need(c);
    const g = await call<{ groups?: { name: string }[] } | { name: string }[]>(token, "groups.getById", { group_id: id });
    const name = Array.isArray(g) ? g[0]?.name : g.groups?.[0]?.name;
    if (!name) throw new PublishError("Сообщество не найдено — проверьте id");
    if (c.photoToken) {
      try { await call(c.photoToken, "photos.getWallUploadServer", { group_id: id }); }
      catch (error) { throw new PublishError(vkPhotoAccessError(error)); }
    }
    return name;
  },
  async publish(input, c) {
    const { token, id } = need(c);
    const raw = input.images?.length ? input.images.slice(0, 10) : input.image ? [input.image] : [];
    // VK принимает только JPG, PNG и GIF; WebP и прочее он отбрасывает (пустой ответ загрузки), поэтому отправляем всё JPEG-ом
    const pics: Img[] = await Promise.all(raw.map(async (p) => /jpe?g/.test(p.mime) ? p : { data: await sharp(p.data).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer(), mime: "image/jpeg" }));
    const message = toPlain(input.text).slice(0, 15000);
    const post = async (attachment?: string, postToken = token) => call<{ post_id: number }>(postToken, "wall.post", { owner_id: `-${id}`, from_group: "1", message, ...(attachment ? { attachments: attachment } : {}) });
    const done = (r: { post_id: number }, warning?: string) => ({ externalId: String(r.post_id), url: `https://vk.com/wall-${id}_${r.post_id}`, warning });
    const errs: string[] = [];
    let wallUploaded = false;
    // пробуем способы по очереди; пост не публикуется, пока не подготовлено вложение, а ошибка вложения не теряет текст
    for (const up of UPLOADERS) {
      if (!pics.length) break;
      if (!up.multi && pics.length > 1 || up.single && pics.length > 1) continue;
      try {
        const ids: string[] = [];
        // User-owned uploads may be invisible to a group token. Keep upload,
        // publishing, verification and cleanup in the same authorization context.
        const postToken = up.name === "стена" ? c.photoToken || token : token;
        // «single»: способ прикрепляет одну ссылку на всё (для карусели — на первый слайд)
        for (const pic of up.single ? pics.slice(0, 1) : pics) ids.push(await up.run(postToken, id, pic, input.imageUrl));
        if (up.name === "стена") wallUploaded = true;
        const r = await post(ids.join(","), postToken).catch(e => {
          if ((e as PublishError).retryable) throw new UncertainPostError("VK не подтвердил результат отправки. Проверьте стену сообщества перед повторной публикацией, чтобы избежать дубликата.");
          throw e;
        });
        // VK может принять вложение и молча его отбросить: проверяем готовый пост, и если картинки нет — удаляем и пробуем другой способ
        let checkErr = "";
        type Wall = { attachments?: unknown[] };
        let got: { items?: Wall[] } | Wall[] | null = null;
        for (const readToken of [...new Set([postToken, c.photoToken, process.env.VK_SERVICE_TOKEN?.trim(), token].filter((t): t is string => !!t))]) {
          try { got = await call<{ items?: Wall[] } | Wall[]>(readToken, "wall.getById", { posts: `-${id}_${r.post_id}` }); checkErr = ""; break; }
          catch (e) { checkErr = (e as Error).message; }
        }
        const list = Array.isArray(got) ? got : got?.items;
        if (checkErr || !list?.[0]) {
          // убедиться, что картинка в посте, нельзя: такой пост не оставляем (картинка — часть публикации)
          await call(postToken, "wall.delete", { owner_id: `-${id}`, post_id: String(r.post_id) }).catch(() => { throw new UncertainPostError(`VK создал пост https://vk.com/wall-${id}_${r.post_id}, но не позволил проверить вложения и удалить его. Проверьте пост в VK перед повторной публикацией.`); });
          throw new PublishError(`Пост не опубликован: VK не позволил проверить, что картинка прикрепилась (способ: ${up.name}). ${errs.length ? `Что не сработало: ${errs.join(" | ")}. ` : ""}`);
        }
        const attachments = list[0].attachments as { type?: string; photo?: { id?: number; owner_id?: number }; link?: { photo?: unknown } }[] | undefined;
        const photos = attachments?.filter(a => a.type === "photo" && a.photo && ids.some(ref => (ref === `photo${a.photo!.owner_id}_${a.photo!.id}` || ref.startsWith(`photo${a.photo!.owner_id}_${a.photo!.id}_`)))) ?? [];
        if (photos.length < pics.length && !(up.single && pics.length === 1 && attachments?.some(a => a.type === "link" && a.link?.photo))) {
          await call(postToken, "wall.delete", { owner_id: `-${id}`, post_id: String(r.post_id) }).catch(() => { throw new UncertainPostError(`VK создал пост https://vk.com/wall-${id}_${r.post_id}, но не позволил проверить вложения и удалить его. Проверьте пост в VK перед повторной публикацией.`); });
          throw new PublishError(`VK принял вложение ${ids.join(",")}, но в пост оно не попало`);
        }
        return done(r);
      } catch (e) {
        if (e instanceof UncertainPostError || (e as PublishError).retryable) throw e;
        errs.push(`${up.name}: ${(e as Error).message}`);
      }
    }
    // картинка есть, а прикрепить её не удалось ни одним способом: пост без картинки не публикуем
    if (pics.length) {
      const reason = wallUploaded ? "Фото загрузилось, но VK не подтвердил его в опубликованной записи. Проверьте права пользователя на публикацию в выбранном сообществе." : vkPhotoAccessError(new Error(errs[0] || "VK не принял изображение"));
      throw new PublishError(`Пост не опубликован. ${reason} Подробности: ${errs.join(" | ")}`);
    }
    return done(await post());
  },
};
