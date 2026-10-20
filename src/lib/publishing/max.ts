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

/** Токен бота: у канала, подключённого через общего бота сервиса (shared), токена в базе нет — берём из окружения сервера. */
export const maxToken = (c: Record<string, string>) => (c.shared ? process.env.MAX_BOT_TOKEN?.trim() ?? "" : (c.token ?? "").trim());

const need = (c: Record<string, string>) => {
  const token = maxToken(c);
  if (!token || !c.target) throw new PublishError(c.shared ? "Бот сервиса MAX не настроен на сервере (MAX_BOT_TOKEN)" : "Для MAX нужны токен бота и id чата или канала");
  return { token, chat: c.target.trim() };
};

export { call as maxCall };

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

/* ───────── чтение постов канала ───────── */
export interface MaxMedia { type: "image" | "video" | "audio" | "file"; url?: string; token?: string; name?: string }
export interface MaxPost { mid: string; text: string; url: string | null; at: Date; views: number | null; media: MaxMedia[] }

interface RawAtt { type?: string; payload?: { url?: string; token?: string; photo_id?: number | string }; filename?: string }
interface RawMsg { timestamp?: number; url?: string; stat?: { views?: number }; body?: { mid?: string; text?: string | null; attachments?: RawAtt[] | null } }

/** Привести ответ GET /messages к постам. Вложения: image/video/audio/file; прочие типы (клавиатуры, стикеры, геопозиция) пропускаем. */
export function mapMessages(raw: unknown): MaxPost[] {
  const arr: RawMsg[] = Array.isArray(raw) ? raw : Array.isArray((raw as { messages?: RawMsg[] })?.messages) ? (raw as { messages: RawMsg[] }).messages : [];
  const out: MaxPost[] = [];
  for (const m of arr) {
    const mid = m.body?.mid;
    if (!mid) continue;
    const media: MaxMedia[] = [];
    for (const a of m.body?.attachments ?? []) {
      if (a.type === "image" || a.type === "video" || a.type === "audio" || a.type === "file") media.push({ type: a.type, url: a.payload?.url, token: a.payload?.token, name: a.filename });
    }
    out.push({ mid, text: (m.body?.text ?? "").trim(), url: m.url ?? null, at: new Date(m.timestamp ?? Date.now()), views: m.stat?.views ?? null, media });
  }
  return out;
}

/** Последние посты канала (бот должен быть администратором с правом читать все сообщения). from — время в миллисекундах: только новее. */
export async function listPosts(token: string, chat: string, o: { from?: number; count?: number } = {}): Promise<MaxPost[]> {
  const q = new URLSearchParams({ chat_id: chat, count: String(Math.min(100, Math.max(1, o.count ?? 50))) });
  if (o.from) q.set("from", String(o.from));
  try { return mapMessages(await call<unknown>(token, "GET", `/messages?${q}`)); }
  catch (e) {
    if (/MAX 403/.test((e as Error).message)) throw new PublishError("MAX не даёт читать посты: добавьте бота в канал администратором и включите право «читать все сообщения»");
    throw e;
  }
}

/** Каналы и чаты, где бот есть, по событиям (список каналов бота MAX отдельным методом не отдаёт). Нужно, чтобы бот недавно получил событие: добавление в канал или пост. */
export async function discoverChats(token: string): Promise<{ id: string; title: string; channel: boolean }[]> {
  const r = await call<{ updates?: { chat_id?: number | string; is_channel?: boolean; message?: { recipient?: { chat_id?: number | string; chat_type?: string } } }[] }>(token, "GET", "/updates?limit=100&timeout=0");
  const seen = new Map<string, boolean>();
  for (const u of r.updates ?? []) {
    const id = u.chat_id ?? u.message?.recipient?.chat_id;
    if (id == null || id === "") continue;
    seen.set(String(id), (seen.get(String(id)) ?? false) || !!u.is_channel || u.message?.recipient?.chat_type === "channel");
  }
  const out: { id: string; title: string; channel: boolean }[] = [];
  for (const [id, channel] of [...seen].slice(0, 20)) {
    let title = id;
    try { title = (await call<{ title?: string }>(token, "GET", `/chats/${encodeURIComponent(id)}`)).title || id; } catch { /* название необязательно */ }
    out.push({ id, title, channel });
  }
  return out;
}
