import { PublishError, type Provider } from "./types";
import { chunk, toPlain } from "./format";

/** credentials: token (от @BotFather), target (@username канала или числовой id; бот — админ канала). */
interface Tg<T> { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } }

const API = () => (process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org").replace(/\/+$/, "");

async function call<T>(token: string, method: string, body: Record<string, unknown> | FormData): Promise<T> {
  let res: Response;
  try {
    const form = body instanceof FormData;
    res = await fetch(`${API()}/bot${token}/${method}`, { method: "POST", ...(form ? {} : { headers: { "Content-Type": "application/json" } }), body: form ? body : JSON.stringify(body), signal: AbortSignal.timeout(form ? 45_000 : 20_000) });
  } catch (e) { throw new PublishError(`Telegram недоступен: ${(e as Error).message}`, true); }
  const j = (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as Tg<T>;
  if (!j.ok) {
    const code = j.error_code ?? res.status;
    // 401/403/400 — конфигурация (токен, права, чат): повтор не поможет
    throw new PublishError(`Telegram ${method}: ${j.description ?? "ошибка"}`, code === 429 || code >= 500);
  }
  return j.result as T;
}

const need = (c: Record<string, string>) => {
  if (!c.token || !c.target) throw new PublishError("Для Telegram нужны токен бота и чат (@канал или id)");
  return { token: c.token, target: c.target.trim() };
};

export const telegram: Provider = {
  kind: "telegram",
  async verify(c) {
    const { token, target } = need(c);
    const me = await call<{ id: number; username: string }>(token, "getMe", {});
    const chat = await call<{ title?: string; username?: string }>(token, "getChat", { chat_id: target });
    const member = await call<{ status: string; can_post_messages?: boolean }>(token, "getChatMember", { chat_id: target, user_id: me.id });
    if (member.status !== "administrator" && member.status !== "creator") throw new PublishError("Бот не администратор канала — добавьте его с правом публикации");
    if (member.status === "administrator" && member.can_post_messages === false) throw new PublishError("У бота нет права публиковать сообщения");
    return `${chat.title ?? chat.username ?? target} (бот @${me.username})`;
  },
  async publish(input, c) {
    const { token, target } = need(c);
    const plain = toPlain(input.text);
    let first: number | null = null;
    let warning: string | undefined;
    let rest = plain;
    if (input.images && input.images.length >= 2) {
      // карусель — альбом из 2–10 фото; подпись (до 1024 знаков) крепится к первому, иначе текст уходит следом отдельным сообщением
      const imgs = input.images.slice(0, 10);
      const fits = plain.length <= 1024;
      const f = new FormData();
      f.set("chat_id", target);
      f.set("media", JSON.stringify(imgs.map((_, i) => ({ type: "photo", media: `attach://p${i}`, ...(i === 0 && fits && plain ? { caption: plain } : {}) }))));
      imgs.forEach((im, i) => f.set(`p${i}`, new Blob([new Uint8Array(im.data)], { type: im.mime }), `slide-${i + 1}.jpg`));
      try { first = (await call<{ message_id: number }[]>(token, "sendMediaGroup", f))[0]?.message_id ?? null; if (fits) rest = ""; }
      catch (e) {
        if ((e as PublishError).retryable) throw e;
        warning = `Слайды не отправлены (${(e as Error).message}), пост опубликован текстом`;
      }
    } else if (input.image || input.images?.length) {
      const one = (input.image ?? input.images![0])!;
      // подпись к фото — до 1024 знаков; если текст длиннее, фото уходит без подписи, а текст следом
      const fits = plain.length <= 1024;
      const f = new FormData();
      f.set("chat_id", target);
      if (fits) f.set("caption", plain);
      f.set("photo", new Blob([new Uint8Array(one.data)], { type: one.mime }), "image.jpg");
      try { first = (await call<{ message_id: number }>(token, "sendPhoto", f)).message_id; if (fits) rest = ""; }
      catch (e) {
        if ((e as PublishError).retryable) throw e; // временный сбой — повторит воркер, дубль не получится: фото не ушло
        warning = `Картинка не отправлена (${(e as Error).message}), пост опубликован без неё`;
      }
    }
    // Лимит Telegram — 4096 знаков на сообщение; длинные статьи уходят несколькими сообщениями подряд.
    const parts = rest ? chunk(rest, 4000) : [];
    for (const text of parts) {
      const m = await call<{ message_id: number }>(token, "sendMessage", { chat_id: target, text, link_preview_options: { is_disabled: false } });
      first ??= m.message_id;
    }
    if (first == null) throw new PublishError("Telegram: пустой текст");
    const handle = target.startsWith("@") ? target.slice(1) : null;
    return { externalId: String(first), url: handle ? `https://t.me/${handle}/${first}` : null, warning };
  },
};
