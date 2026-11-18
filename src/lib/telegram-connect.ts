import { randomInt } from "node:crypto";
import { one, q } from "./db";
import { seal } from "./crypto";
import { hashState } from "./channel-connections";
import { telegramCall } from "./publishing/telegram";

interface Update { message?: { chat: { id: number; type: string }; from?: { id: number; is_bot?: boolean }; text?: string; chat_shared?: { request_id: number; chat_id: number; title?: string } } }
const rights = { is_anonymous: false, can_manage_chat: true, can_delete_messages: false, can_manage_video_chats: false, can_restrict_members: false, can_promote_members: false, can_change_info: false, can_invite_users: false, can_post_stories: false, can_edit_stories: false, can_delete_stories: false, can_post_messages: true, can_edit_messages: true };

export async function handleTelegramConnect(update: Update) {
  const m = update.message, sender = m?.from;
  if (!m || m.chat.type !== "private" || !sender || sender.is_bot) return;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("Бот Telegram не настроен");
  const start = m.text?.match(/^\/start(?:@\w+)? ([A-Za-z0-9_-]{32})$/)?.[1];
  if (start) {
    const requestId = randomInt(1, 2_147_483_647);
    const [row] = await q<{ id: string }>("update kz_channel_connections set external_user_id=$2,request_id=$3 where provider='telegram' and state_hash=$1 and status='pending' and expires_at>now() and (external_user_id is null or external_user_id=$2) returning id", [hashState(start), sender.id, requestId]);
    if (!row) { await telegramCall(token, "sendMessage", { chat_id: m.chat.id, text: "Ссылка подключения истекла или уже использована. Начните подключение на сайте заново." }); return; }
    await telegramCall(token, "sendMessage", { chat_id: m.chat.id, text: "Выберите канал для JuicerAI. Telegram предложит добавить бота с правом публикации. После выбора вернитесь на сайт и подтвердите подключение.", reply_markup: { keyboard: [[{ text: "Выбрать канал", request_chat: { request_id: requestId, chat_is_channel: true, user_administrator_rights: { ...rights, can_promote_members: true }, bot_administrator_rights: rights, request_title: true, request_username: true } }]], resize_keyboard: true, one_time_keyboard: true } });
    return;
  }
  if (!m.chat_shared) return;
  const shared = m.chat_shared;
  const row = await one<{ id: string }>("select id from kz_channel_connections where provider='telegram' and external_user_id=$1 and request_id=$2 and status='pending' and expires_at>now()", [sender.id, shared.request_id]);
  if (!row) return;
  const member = await telegramCall<{ status: string }>(token, "getChatMember", { chat_id: shared.chat_id, user_id: sender.id });
  if (!["creator", "administrator"].includes(member.status)) throw new Error("Выбор канала не подтверждён правами администратора");
  const chat = await telegramCall<{ title?: string; type: string }>(token, "getChat", { chat_id: shared.chat_id });
  if (chat.type !== "channel") throw new Error("Выберите канал Telegram");
  const result = await q("update kz_channel_connections set status='ready',payload=$2 where id=$1 and status='pending' and external_user_id=$3 and request_id=$4 and expires_at>now() returning id", [row.id, JSON.stringify(seal({ telegramUserId: String(sender.id), options: JSON.stringify([{ id: String(shared.chat_id), title: chat.title || shared.title || "Канал Telegram" }]) })), sender.id, shared.request_id]);
  if (result.length) await telegramCall(token, "sendMessage", { chat_id: m.chat.id, text: "Канал выбран. Вернитесь в JuicerAI и нажмите «Подключить».", reply_markup: { remove_keyboard: true } });
}
