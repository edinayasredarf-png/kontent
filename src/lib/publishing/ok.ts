import { createHash } from "node:crypto";
import { PublishError, type Provider } from "./types";
import { media, noArticle, textLimit } from "./http";
import { safeRequest } from "../safefetch";
import { socialAppConfig } from "../social-oauth-config";
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
export function okSignature(params: Record<string, string>, secret: string) {
  return md5(Object.keys(params).filter(k => !["access_token", "sig"].includes(k)).sort().map(k => `${k}=${params[k]}`).join("") + secret);
}
export function okSessionSecret(token: string, secret: string) { return md5(token + secret); }
export async function okCall(c: Record<string, string>, method: string, params: Record<string, string> = {}, final = false): Promise<unknown> {
  let key = c.applicationKey, secret = c.sessionSecret;
  if (!key || !secret) { const app = await socialAppConfig("ok"); if (!app) throw new PublishError("Одноклассники: администратору нужно настроить собственное приложение в разделе «Соцсети»."); key = app.applicationKey; secret = okSessionSecret(c.token, app.secret); }
  if (!c.token) throw new PublishError("Одноклассники: подключите аккаунт заново.");
  const values = { ...params, method, application_key: key, format: "json" };
  const body = new URLSearchParams({ ...values, sig: okSignature(values, secret), access_token: c.token });
  let r: Response;
  try { r = await fetch("https://api.ok.ru/fb.do", { method: "POST", redirect: "error", signal: AbortSignal.timeout(30000), body }); }
  catch { throw new PublishError("Одноклассники не подтвердили ответ. Проверьте группу перед повторной публикацией.", !final); }
  let j: unknown; try { j = await r.json(); } catch { throw new PublishError("Одноклассники вернули некорректный ответ.", !final); }
  const error = j && typeof j === "object" ? (j as { error_code?: number }).error_code : null;
  if (!r.ok || error) throw new PublishError(`Одноклассники: запрос отклонён (HTTP ${r.status}${error ? `, код ${error}` : ""}). Проверьте доступы приложения и повторно подключите аккаунт при истечении сессии.`, r.status === 429 || !final && r.status >= 500);
  return j;
}
export async function okGroups(c: Record<string, string>): Promise<{ id: string; title: string }[]> {
  const ids: string[] = []; let anchor = "";
  for (let page = 0; page < 20; page++) {
    const j = await okCall(c, "group.getUserGroupsV2", { count: "100", ...(anchor ? { anchor } : {}) }) as { groups?: { groupId: string; role: string[]; status?: string }[]; anchor?: string };
    if (!Array.isArray(j?.groups)) throw new PublishError("Одноклассники не вернули список групп.");
    for (const g of j.groups) if (Array.isArray(g.role) && g.role.some(r => ["ADMIN", "EDITOR", "MODERATOR", "SUPER_MODERATOR"].includes(r)) && (!g.status || g.status === "ACTIVE")) ids.push(String(g.groupId));
    if (!j.anchor || !j.groups.length) break;
    if (j.anchor === anchor || page === 19) throw new PublishError("Список групп ОК слишком велик или не удалось завершить пагинацию. Обратитесь в поддержку.");
    anchor = j.anchor;
  }
  const unique = [...new Set(ids)].filter(id => /^\d+$/.test(id)), options: { id: string; title: string }[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const info = await okCall(c, "group.getInfo", { uids: unique.slice(i, i + 100).join(","), fields: "uid,name" }) as { uid?: string; name?: string }[];
    if (!Array.isArray(info)) throw new PublishError("Одноклассники не вернули названия групп.");
    for (const g of info) if (g.uid && unique.includes(String(g.uid))) options.push({ id: String(g.uid), title: g.name || `Группа ${g.uid}` });
  }
  return options;
}
export function okProvider(uploadRequest: typeof safeRequest = safeRequest): Provider { return {
  kind: "ok",
  async verify(c) { if (!/^\d+$/.test(c.target)) throw new PublishError("Укажите числовой ID группы ОК."); const group = (await okGroups(c)).find(g => g.id === c.target); if (!group) throw new PublishError("У аккаунта ОК нет права публикации в выбранной группе."); return group.title; },
  async publish(input, c) {
    noArticle(input); textLimit(input.text, 10000, "Одноклассники"); const images = media(input);
    if (!/^\d+$/.test(c.target)) throw new PublishError("Одноклассники: некорректный ID группы.");
    if (images.length > 10) throw new PublishError("Одноклассники: поддерживается максимум 10 изображений.");
    if (!input.text.trim() && !images.length) throw new PublishError("Одноклассники: пустой пост.");
    const photos: { id: string }[] = [];
    for (const image of images) {
      if (image.data.length > 10_000_000 || !["image/jpeg", "image/png"].includes(image.mime)) throw new PublishError("Одноклассники: нужны JPEG/PNG до 10 МБ.");
      const upload = await okCall(c, "photosV2.getUploadUrl", { gid: c.target, count: "1" }) as { upload_url?: string; photo_ids?: string[] };
      if (!upload?.upload_url || !upload.photo_ids?.[0] || new URL(upload.upload_url).protocol !== "https:") throw new PublishError("Одноклассники не вернули HTTPS-адрес загрузки фото.");
      const form = new FormData(); form.set("pic1", new Blob([new Uint8Array(image.data)], { type: image.mime }), image.mime === "image/png" ? "image.png" : "image.jpg");
      let response: { status: number; text: string };
      try { response = await uploadRequest(upload.upload_url, { method: "POST", body: form, timeoutMs: 30000 }); } catch { throw new PublishError("Не удалось загрузить фотографию в Одноклассники.", true); }
      let result: { photos?: Record<string, { token?: string }> } = {}; try { result = JSON.parse(response.text); } catch { /* rejected below */ }
      const token = result?.photos?.[upload.photo_ids[0]]?.token;
      if (response.status !== 200 || !token) throw new PublishError("Одноклассники не подтвердили загрузку фотографии. Пост не отправлен.");
      photos.push({ id: token });
    }
    const attachment = { media: [...(input.text ? [{ type: "text", text: input.text }] : []), ...(photos.length ? [{ type: "photo", list: photos }] : [])] };
    const result = await okCall(c, "mediatopic.post", { gid: c.target, type: "GROUP_THEME", attachment: JSON.stringify(attachment) }, true);
    if (typeof result !== "string" || !/^\d+$/.test(result)) throw new PublishError("Одноклассники не подтвердили ID поста. Проверьте группу перед повторной отправкой.");
    return { externalId: result, url: `https://ok.ru/group/${c.target}/topic/${result}` };
  },
}; }
export const ok = okProvider();
