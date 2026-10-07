import { PublishError, type Provider } from "./types";
import { chunk, toPlain } from "./format";

/** credentials: token (от @BotFather), target (@username канала или числовой id; бот — админ канала). */
interface Tg<T> { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } }

async function call<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
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
    // Лимит Telegram — 4096 знаков на сообщение; длинные статьи уходят несколькими сообщениями подряд.
    const parts = chunk(toPlain(input.text), 4000);
    let first: number | null = null;
    for (const text of parts) {
      const m = await call<{ message_id: number }>(token, "sendMessage", { chat_id: target, text, link_preview_options: { is_disabled: false } });
      first ??= m.message_id;
    }
    if (first == null) throw new PublishError("Telegram: пустой текст");
    const handle = target.startsWith("@") ? target.slice(1) : null;
    return { externalId: String(first), url: handle ? `https://t.me/${handle}/${first}` : null };
  },
};
