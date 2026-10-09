import { PublishError, type Provider } from "./types";
import { chunk, toPlain } from "./format";
import type { Img } from "./types";

/**
 * MAX (бот-API мессенджера). credentials: token — токен бота, target — id чата/канала, где бот администратор.
 * БЕТА: формат запросов взят из документации dev.max.ru, на живом канале не проверялся.
 * Картинки (и слайды карусели, до 10 штук): POST /uploads?type=image → загрузка файла (multipart, поле data) по выданному url →
 * токен в attachments сообщения; сразу после загрузки MAX может ответить attachment.not.ready — тогда повторяем с паузой.
 */
const API = () => (process.env.MAX_API_BASE?.trim() || "https://platform-api2.max.ru").replace(/\/+$/, "");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const notReady = (e: unknown) => /not\.ready|not ready|not\.processed/i.test((e as Error).message);

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try { res = await fetch(`${API()}${path}`, { method, headers: { Authorization: token, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) }); }
  catch (e) { throw new PublishError(`MAX недоступен: ${(e as Error).message}`, true); }
  const text = await res.text(); let j: Record<string, unknown> = {}; try { j = JSON.parse(text); } catch { /* не JSON */ }
  if (res.status === 401) throw new PublishError("MAX отклонил токен бота");
  if (!res.ok) throw new PublishError(`MAX ${res.status}: ${String([j.code, j.message ?? j.error].filter(Boolean).join(" ") || text).slice(0, 180)}`, res.status >= 500 || res.status === 429);
  return j as T;
}

/** Загружает картинку и возвращает токен для вложения. */
async function upload(token: string, img: Img, n: number): Promise<string> {
  const slot = await call<{ url?: string; token?: string }>(token, "POST", "/uploads?type=image");
  if (!slot.url) throw new PublishError("MAX не выдал адрес для загрузки картинки", true);
  const f = new FormData();
  f.set("data", new Blob([new Uint8Array(img.data)], { type: img.mime }), `image-${n}.jpg`);
  let res: Response;
  try { res = await fetch(slot.url, { method: "POST", body: f, signal: AbortSignal.timeout(60_000) }); }
  catch (e) { throw new PublishError(`MAX: загрузка картинки не удалась: ${(e as Error).message}`, true); }
  const text = await res.text();
  if (!res.ok) throw new PublishError(`MAX: загрузка картинки ${res.status}: ${text.slice(0, 150)}`, res.status >= 500 || res.status === 429);
  // для изображений токен приходит в ответе на загрузку (photos → {id: {token}}), иначе берём выданный на первом шаге
  let t = "";
  try { const j = JSON.parse(text) as { token?: string; photos?: Record<string, { token?: string }> }; t = j.token || Object.values(j.photos ?? {})[0]?.token || ""; } catch { /* не JSON */ }
  t ||= slot.token ?? "";
  if (!t) throw new PublishError("MAX не вернул токен загруженной картинки", true);
  return t;
}

const need = (c: Record<string, string>) => {
  if (!c.token || !c.target) throw new PublishError("Для MAX нужны токен бота и id чата или канала");
  return { token: c.token.trim(), chat: c.target.trim() };
};

export const max: Provider = {
  kind: "max",
  async verify(c) {
    const { token, chat } = need(c);
    const me = await call<{ name?: string; username?: string }>(token, "GET", "/me");
    const ch = await call<{ title?: string }>(token, "GET", `/chats/${encodeURIComponent(chat)}`);
    return `${ch.title ?? chat} (бот ${me.username ?? me.name ?? "?"})`;
  },
  async publish(input, c) {
    const { token, chat } = need(c);
    const imgs = (input.images?.length ? input.images : input.image ? [input.image] : []).slice(0, 10);
    let attachments: { type: "image"; payload: { token: string } }[] = [];
    let warning: string | undefined;
    try { for (let i = 0; i < imgs.length; i++) attachments.push({ type: "image", payload: { token: await upload(token, imgs[i], i + 1) } }); }
    catch (e) {
      if ((e as PublishError).retryable && !attachments.length && imgs.length) throw e; // временный сбой до первой картинки — воркер повторит весь пост
      attachments = []; warning = `Картинки не загрузились (${(e as Error).message}) — пост ушёл текстом`;
    }
    const parts = chunk(toPlain(input.text), 3900);
    let first = "";
    for (let i = 0; i < Math.max(parts.length, 1); i++) {
      const body: Record<string, unknown> = { text: parts[i] ?? "" };
      if (i === 0 && attachments.length) body.attachments = attachments;
      let r: { message?: { body?: { mid?: string } } } | undefined;
      for (let attempt = 0; attempt < 6; attempt++) {
        try { r = await call(token, "POST", `/messages?chat_id=${encodeURIComponent(chat)}`, body); break; }
        catch (e) { if (i === 0 && attachments.length && notReady(e) && attempt < 5) { await wait(1000 + attempt * 1000); continue; } throw e; }
      }
      first ||= r?.message?.body?.mid ?? "";
    }
    return { externalId: first || String(Date.now()), url: null, warning };
  },
};
