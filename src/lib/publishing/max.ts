import { PublishError, type Provider } from "./types";
import { chunk, toPlain } from "./format";

/**
 * MAX (бот-API мессенджера). credentials: token — токен бота, target — id чата/канала, где бот администратор.
 * БЕТА: адреса и формат запросов взяты из публичной документации, на живом канале не проверялись.
 * Картинки пока не отправляются (в MAX загрузка файлов идёт отдельным двухшаговым процессом).
 */
const API = () => (process.env.MAX_API_BASE?.trim() || "https://platform-api.max.ru").replace(/\/+$/, "");

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try { res = await fetch(`${API()}${path}`, { method, headers: { Authorization: token, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) }); }
  catch (e) { throw new PublishError(`MAX недоступен: ${(e as Error).message}`, true); }
  const text = await res.text(); let j: Record<string, unknown> = {}; try { j = JSON.parse(text); } catch { /* не JSON */ }
  if (res.status === 401) throw new PublishError("MAX отклонил токен бота");
  if (!res.ok) throw new PublishError(`MAX ${res.status}: ${String(j.message ?? j.error ?? text).slice(0, 180)}`, res.status >= 500 || res.status === 429);
  return j as T;
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
    let first = "";
    for (const text of chunk(toPlain(input.text), 3900)) {
      const r = await call<{ message?: { body?: { mid?: string } } }>(token, "POST", `/messages?chat_id=${encodeURIComponent(chat)}`, { text });
      first ||= r.message?.body?.mid ?? "";
    }
    return { externalId: first || String(Date.now()), url: null, warning: input.image || input.images?.length ? "Картинки в MAX пока не отправляются — пост ушёл текстом" : undefined };
  },
};
