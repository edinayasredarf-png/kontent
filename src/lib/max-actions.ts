"use server";
import { revalidatePath } from "next/cache";
import { requireManager } from "./auth";
import { requireAdmin, audit } from "./admin";
import { q } from "./db";
import { botConfigured, connectChat, linkStatus, newLink, subscribe, type MaxChatOpt } from "./max-bot";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const msg = (e: unknown) => ((e as Error).message || "Ошибка").slice(0, 300);

/** Шаг 2: выдаём одноразовый ключ (действует 30 минут) для выбранного бренда. */
export async function maxStartLinkAction(brandId: string): Promise<R<{ code: string; expiresAt: string }>> {
  const c = await requireManager();
  if (!botConfigured()) return { ok: false, error: "Бот MAX пока не настроен на сервере" };
  try { return { ok: true, ...(await newLink(c.org.id, c.user.id, String(brandId))) }; } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Опрос: бот уже получил ключ? Когда да — возвращаем каналы, где вы администратор, а бот добавлен. */
export async function maxLinkStatusAction(code: string): Promise<R<{ status: "pending" | "linked" | "expired"; chats?: MaxChatOpt[]; diag?: string }>> {
  const c = await requireManager();
  try { return { ok: true, ...(await linkStatus(c.org.id, c.user.id, String(code))) }; } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Шаг 3: подключить выбранный канал. Если окно открыто из настроек завода, канал сразу включается в публикацию этого завода. */
export async function maxConnectChatAction(code: string, chatId: string, factoryId?: string): Promise<R<{ title: string }>> {
  const c = await requireManager();
  try {
    const r = await connectChat(c.org.id, c.user.id, String(code), String(chatId));
    if (!r.ok) return r;
    if (factoryId && /^[0-9a-f-]{36}$/i.test(factoryId)) {
      await q("update kz_factories set channel_ids = array_append(channel_ids, $3::uuid) where id=$1 and org_id=$2 and brand_id=$4 and not ($3::uuid = any(channel_ids))", [factoryId, c.org.id, r.id, r.brandId]);
    }
    revalidatePath("/app", "layout");
    return { ok: true, title: r.title };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Только для администратора платформы: подписать бота на вебхук (один раз, после задания переменных окружения). */
export async function maxSubscribeAction(): Promise<R<{ url: string }>> {
  const c = await requireAdmin();
  try {
    const url = await subscribe();
    await audit(c.user, "max.subscribe", "max_bot", "webhook", { url });
    return { ok: true, url };
  } catch (e) { return { ok: false, error: msg(e) }; }
}
