import { randomInt } from "node:crypto";
import { one, q } from "./db";
import { open, seal } from "./crypto";
import { maxCall } from "./publishing/max";

/**
 * Общий бот сервиса в MAX. Пользователь добавляет бота администратором в свой канал, получает на сайте одноразовый ключ и отправляет его боту
 * в личные сообщения: так мы узнаём его MAX-аккаунт. Канал подключается, только если этот аккаунт — администратор канала (проверка у MAX).
 * Токен бота — только в окружении сервера (MAX_BOT_TOKEN), в базе каналов его нет.
 */
export const botToken = () => process.env.MAX_BOT_TOKEN?.trim() ?? "";
export const botConfigured = () => !!botToken();
export const botUsername = () => (process.env.MAX_BOT_USERNAME?.trim() || "").replace(/^@/, "");
export const botLink = () => (botUsername() ? `https://max.ru/${botUsername()}` : "");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих знаков: 0/O, 1/I
export const LINK_TTL_MIN = 30;
const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const showCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** Новый ключ привязки для бренда организации. Старые неиспользованные ключи этого пользователя гасим. */
export async function newLink(orgId: string, userId: string, brandId: string): Promise<{ code: string; expiresAt: string }> {
  if (!(await one("select 1 from kz_brands where id=$1 and org_id=$2", [brandId, orgId]))) throw new Error("Выберите бренд");
  await q("delete from kz_max_links where org_id=$1 and user_id=$2 and status<>'used'", [orgId, userId]);
  const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const r = await one<{ expires_at: string }>("insert into kz_max_links(org_id,user_id,brand_id,code,expires_at) values($1,$2,$3,$4, now() + ($5 || ' minutes')::interval) returning expires_at", [orgId, userId, brandId, code, String(LINK_TTL_MIN)]);
  return { code: showCode(code), expiresAt: r!.expires_at };
}

interface Admins { members?: { user_id?: number; is_admin?: boolean; is_owner?: boolean }[] }

/** Администратор ли этот MAX-пользователь в чате (по данным MAX). Бот сам должен быть администратором чата — иначе MAX не отдаст список. */
export async function isChatAdmin(chatId: string | number, maxUserId: string | number): Promise<boolean> {
  const r = await maxCall<Admins>(botToken(), "GET", `/chats/${encodeURIComponent(String(chatId))}/members/admins`);
  return (r.members ?? []).some((m) => String(m.user_id) === String(maxUserId) && (m.is_admin !== false || m.is_owner));
}

export interface MaxChatOpt { id: string; title: string; channel: boolean }

/** Состояние ключа и, когда ключ получен ботом, каналы этого пользователя (где он администратор, а бот добавлен). */
export async function linkStatus(orgId: string, userId: string, codeIn: string): Promise<{ status: "pending" | "linked" | "expired"; chats?: MaxChatOpt[] }> {
  const l = await one<{ status: string; max_user_id: string | null; live: boolean }>("select status,max_user_id,expires_at > now() live from kz_max_links where org_id=$1 and user_id=$2 and code=$3", [orgId, userId, normCode(codeIn)]);
  if (!l || !l.live || l.status === "used") return { status: "expired" };
  if (l.status === "pending" || !l.max_user_id) return { status: "pending" };
  const rows = await q<{ chat_id: string; title: string; is_channel: boolean }>("select chat_id::text,title,is_channel from kz_max_chats where active order by updated_at desc limit 40");
  const checked = await Promise.all(rows.map(async (c) => ({ c, ok: await isChatAdmin(c.chat_id, l.max_user_id!).catch(() => false) })));
  return { status: "linked", chats: checked.filter((x) => x.ok).map(({ c }) => ({ id: c.chat_id, title: c.title || `Канал ${c.chat_id}`, channel: c.is_channel })) };
}

/** Создать канал для выбранного чата. Всё перепроверяется на сервере: ключ этого пользователя и организации, админство в чате по данным MAX. */
export async function connectChat(orgId: string, userId: string, codeIn: string, chatId: string): Promise<{ ok: true; id: string; title: string; brandId: string } | { ok: false; error: string }> {
  if (!/^-?\d{1,18}$/.test(chatId)) return { ok: false, error: "Неверный id канала" };
  const l = await one<{ id: string; brand_id: string; max_user_id: string | null }>("select id,brand_id,max_user_id from kz_max_links where org_id=$1 and user_id=$2 and code=$3 and status='linked' and expires_at > now()", [orgId, userId, normCode(codeIn)]);
  if (!l?.max_user_id) return { ok: false, error: "Ключ не подтверждён или истёк. Получите новый ключ и отправьте его боту" };
  const known = await one<{ title: string }>("select title from kz_max_chats where chat_id=$1 and active", [chatId]);
  if (!known) return { ok: false, error: "Бот не добавлен в этот канал" };
  try {
    if (!(await isChatAdmin(chatId, l.max_user_id))) return { ok: false, error: "Ваш аккаунт MAX не администратор этого канала" };
  } catch (e) { return { ok: false, error: `Не удалось проверить права: ${(e as Error).message}. Сделайте бота администратором канала` }; }
  const chans = await q<{ id: string; credentials: unknown }>("select id,credentials from kz_channels where org_id=$1 and kind='max'", [orgId]);
  if (chans.some((c) => { try { return open(c.credentials).target === chatId; } catch { return false; } })) return { ok: false, error: "Этот канал уже подключён" };
  const title = known.title || `Канал ${chatId}`;
  const ch = await one<{ id: string }>("insert into kz_channels(org_id,brand_id,kind,title,credentials) values($1,$2,'max',$3,$4) returning id", [orgId, l.brand_id, title, JSON.stringify(seal({ target: chatId, shared: "1" }))]);
  await q("update kz_max_links set status='used' where id=$1", [l.id]);
  return { ok: true, id: ch!.id, title, brandId: l.brand_id };
}

/* ───────── события от MAX (вебхук) ───────── */
interface Upd {
  update_type?: string; chat_id?: number; is_channel?: boolean; title?: string; user?: { user_id?: number };
  message?: { sender?: { user_id?: number; is_bot?: boolean }; recipient?: { chat_id?: number; chat_type?: string; user_id?: number }; body?: { text?: string | null } };
}

export async function say(userId: number | string, text: string) {
  await maxCall(botToken(), "POST", `/messages?user_id=${encodeURIComponent(String(userId))}`, { text }).catch((e) => console.error("[max-bot] ответ не отправлен:", (e as Error).message));
}

const HELP = (name: string) => `Здравствуйте! Это бот сервиса публикации${name ? ` «${name}»` : ""}.\n\nЧтобы подключить канал: добавьте меня администратором в ваш канал, на сайте нажмите «Получить ключ» и отправьте ключ сюда сообщением.`;

export async function handleUpdate(u: Upd): Promise<void> {
  const t = u.update_type;
  if (t === "bot_added" && u.chat_id != null) {
    let title = "";
    try { title = (await maxCall<{ title?: string }>(botToken(), "GET", `/chats/${u.chat_id}`)).title ?? ""; } catch { /* название подтянем позже */ }
    await q(`insert into kz_max_chats(chat_id,title,is_channel,added_by,active) values($1,$2,$3,$4,true)
             on conflict(chat_id) do update set title=case when excluded.title<>'' then excluded.title else kz_max_chats.title end,is_channel=excluded.is_channel,added_by=excluded.added_by,active=true,updated_at=now()`,
      [u.chat_id, title, u.is_channel !== false, u.user?.user_id ?? null]);
  } else if (t === "bot_removed" && u.chat_id != null) {
    await q("update kz_max_chats set active=false, updated_at=now() where chat_id=$1", [u.chat_id]);
  } else if (t === "chat_title_changed" && u.chat_id != null && u.title) {
    await q("update kz_max_chats set title=$2, updated_at=now() where chat_id=$1", [u.chat_id, u.title]);
  } else if (t === "bot_started") {
    const id = u.user?.user_id; if (id != null) await say(id, HELP(process.env.NEXT_PUBLIC_SITE_NAME ?? ""));
  } else if (t === "message_created") {
    const m = u.message, from = m?.sender?.user_id;
    if (!m || from == null || m.sender?.is_bot || m.recipient?.chat_type !== "dialog") return; // ключ принимаем только в личной переписке
    const code = normCode(m.body?.text ?? "");
    if (code.length !== 8) { await say(from, HELP("")); return; }
    const r = await q<{ id: string }>("update kz_max_links set status='linked', max_user_id=$2 where code=$1 and status in ('pending','linked') and expires_at > now() returning id", [code, from]);
    await say(from, r.length ? "Ключ принят. Вернитесь на сайт и выберите канал из списка." : "Ключ не найден или истёк. Получите новый ключ на сайте и отправьте его сюда.");
  }
}

/** Подписка бота на события через вебхук (нужна один раз, делает администратор платформы). */
export async function subscribe(): Promise<string> {
  const base = process.env.APP_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.MAX_WEBHOOK_SECRET?.trim();
  if (!botConfigured()) throw new Error("Не задан MAX_BOT_TOKEN");
  if (!base) throw new Error("Не задан APP_URL (адрес сайта по https)");
  if (!secret || !/^[a-zA-Z0-9_-]{5,256}$/.test(secret)) throw new Error("MAX_WEBHOOK_SECRET: от 5 до 256 знаков, только латиница, цифры, _ и -");
  const r = await maxCall<{ success?: boolean; message?: string }>(botToken(), "POST", "/subscriptions", { url: `${base}/api/max/webhook`, update_types: ["bot_added", "bot_removed", "bot_started", "message_created", "chat_title_changed"], secret });
  if (r.success === false) throw new Error(r.message ?? "MAX не принял подписку");
  return `${base}/api/max/webhook`;
}

/** Состояние бота для админки: переменные окружения, токен, подписка на вебхук и совпадение её адреса с ожидаемым. */
export async function botState(): Promise<{ ok: boolean; text: string }> {
  if (!botConfigured()) return { ok: false, text: "Бот MAX не настроен (MAX_BOT_TOKEN)" };
  const miss = [!process.env.MAX_WEBHOOK_SECRET?.trim() && "MAX_WEBHOOK_SECRET", !process.env.APP_URL?.trim() && "APP_URL", !botUsername() && "MAX_BOT_USERNAME"].filter(Boolean);
  if (miss.length) return { ok: false, text: `Бот MAX: не заданы переменные ${miss.join(", ")}` };
  try {
    const me = await maxCall<{ username?: string; name?: string }>(botToken(), "GET", "/me");
    const subs = await maxCall<{ subscriptions?: { url?: string; update_types?: string[] }[] }>(botToken(), "GET", "/subscriptions");
    const list = subs.subscriptions ?? [];
    const want = `${process.env.APP_URL!.trim().replace(/\/+$/, "")}/api/max/webhook`;
    const name = me.username ?? me.name ?? "?";
    if (!list.length) return { ok: false, text: `Бот ${name}: вебхук не подключён — нажмите «Подключить вебхук бота MAX» ниже` };
    if (!list.some((x) => x.url === want)) return { ok: false, text: `Бот ${name}: подписка на другой адрес (${list[0].url}), ожидается ${want} — нажмите «Подключить вебхук бота MAX»` };
    const need = ["bot_added", "message_created"].filter((t) => !list.some((x) => !x.update_types || x.update_types.includes(t)));
    if (need.length) return { ok: false, text: `Бот ${name}: подписка без событий ${need.join(", ")} — нажмите «Подключить вебхук бота MAX»` };
    return { ok: true, text: `Бот ${name}: вебхук подключён (${want})` };
  } catch (e) { return { ok: false, text: `Бот MAX: ${(e as Error).message}` }; }
}
