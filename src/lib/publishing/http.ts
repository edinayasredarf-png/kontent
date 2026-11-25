import { PublishError, type PublishInput } from "./types";

/** Fixed API endpoints only. Never echo request URLs, tokens or remote error bodies. */
export async function api(label: string, url: string, init: RequestInit = {}, final = false): Promise<Record<string, unknown>> {
  let r: Response;
  try { r = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) }); }
  catch { throw new PublishError(`${label}: нет подтверждения ответа. ${final ? "Проверьте площадку перед повторной публикацией, чтобы избежать дубля." : "Не удалось связаться с API."}`, !final); }
  let j: Record<string, unknown> = {};
  try { const parsed = await r.json(); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) j = parsed; } catch { /* handled below */ }
  if (!r.ok || j.error || j.ok === false) {
    const code = typeof j.error === "object" && j.error ? (j.error as { code?: unknown }).code : undefined;
    throw new PublishError(`${label}: API отклонил запрос (HTTP ${r.status}${typeof code === "number" ? `, код ${code}` : ""}). ${r.status === 401 || r.status === 403 ? "Проверьте срок действия токена и разрешения приложения." : "Проверьте права аккаунта и ограничения формата."}`, r.status === 429 || !final && r.status >= 500);
  }
  return j;
}
export function externalId(j: Record<string, unknown>, label: string): string {
  if (typeof j.id !== "string" || !/^[\w-]+$/.test(j.id)) throw new PublishError(`${label}: API не подтвердил идентификатор публикации. Проверьте площадку перед повторной отправкой.`);
  return j.id;
}
export function numericTarget(c: Record<string, string>): string {
  if (!/^\d+$/.test(c.target)) throw new PublishError("Укажите числовой ID аккаунта, страницы или доски.");
  if (!c.token) throw new PublishError("Укажите токен доступа.");
  return c.target;
}
export function media(input: PublishInput) { return input.images?.length ? input.images : input.image ? [input.image] : []; }
export function mediaUrls(input: PublishInput): string[] {
  const count = media(input).length;
  const urls = input.imageUrls?.length ? input.imageUrls : input.imageUrl ? [input.imageUrl] : [];
  if (urls.length !== count || urls.some(u => { try { return new URL(u).protocol !== "https:"; } catch { return true; } })) throw new PublishError("Для каждого изображения нужна публичная HTTPS-ссылка. Проверьте APP_URL платформы.");
  return urls;
}
export function textLimit(text: string, max: number, label: string) {
  if ([...text].length > max) throw new PublishError(`${label}: текст длиннее ${max} символов. Сократите его или создайте вариант для площадки.`);
}
export function noArticle(input: PublishInput) { if (input.article) throw new PublishError("Эта площадка принимает посты, а не SEO-статьи. Создайте вариант в формате поста."); }
export function bearer(token: string) { return { Authorization: `Bearer ${token}` }; }
export function jsonBody(value: unknown): RequestInit { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }; }
