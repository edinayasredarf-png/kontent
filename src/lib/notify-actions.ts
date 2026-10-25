"use server";
import { requireCtx } from "./auth";
import { listNotifications, markRead, unreadCount, type Notification } from "./notify";

/** Колокольчик опрашивает сервер раз в минуту: свежие уведомления и число непрочитанных. */
export async function pollNotificationsAction(): Promise<{ items: Notification[]; unread: number }> {
  const c = await requireCtx();
  const [items, unread] = await Promise.all([listNotifications(c.user.id, 15), unreadCount(c.user.id)]);
  return { items, unread };
}

export async function markNotificationAction(id: string): Promise<void> {
  const c = await requireCtx();
  await markRead(c.user.id, id);
}

export async function markAllNotificationsAction(): Promise<void> {
  const c = await requireCtx();
  await markRead(c.user.id, "all");
}
