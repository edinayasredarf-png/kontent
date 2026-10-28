"use server";
import { requireCtx } from "./auth";
import { one } from "./db";
import { listNotifications, markRead, unreadCount, type Notification } from "./notify";

/** Колокольчик опрашивает сервер раз в минуту: свежие уведомления и число непрочитанных. */
export async function pollNotificationsAction(withList = true): Promise<{ items: Notification[]; unread: number; alerts: number }> {
  const c = await requireCtx();
  if (!withList) return { items: [], unread: await unreadCount(c.user.id), alerts: 0 };
  const [items, unread, a] = await Promise.all([listNotifications(c.user.id, 15), unreadCount(c.user.id), one<{ n: string }>(
    `select ((select count(*) from kz_publications where org_id=$1 and status='failed' and created_at > now() - interval '7 days')
           + (select count(*) from kz_content_items i join kz_factories f on f.id=i.factory_id where i.org_id=$1 and i.status='idea' and f.approval='manual')
           + (select count(*) from kz_comments where org_id=$1 and status='new')) n`, [c.org.id]).catch(() => null)]);
  return { items, unread, alerts: Number(a?.n ?? 0) };
}

export async function markNotificationAction(id: string): Promise<void> {
  const c = await requireCtx();
  await markRead(c.user.id, id);
}

export async function markAllNotificationsAction(): Promise<void> {
  const c = await requireCtx();
  await markRead(c.user.id, "all");
}
