import { one, q } from "./db";

/**
 * Уведомления в колокольчике. Пишутся из мест, где что-то происходит (публикация, ошибка, новости, ответ поддержки, баланс).
 * Сбой записи и отсутствие миграции 033 не должны ломать основную работу, поэтому все ошибки глотаем.
 * dedupe — ключ против повторов: одно и то же событие не создаёт второе уведомление у того же человека.
 */
export type NotifyKind =
  | "published" | "publish_failed" | "material_ready" | "generation_failed" | "ideas_pending" | "news_match" | "source_error"
  | "support" | "low_balance" | "topup" | "plan_low" | "comments" | "team" | "announce" | "setup" | "report";

export interface Note { kind: NotifyKind; title: string; body?: string; href?: string; dedupe?: string; userId?: string; /** кому: по умолчанию владелец, админ и редактор */ to?: "writers" | "managers" }

export const KIND_LABEL: Record<NotifyKind, string> = {
  published: "Публикации", publish_failed: "Ошибки публикации", material_ready: "Готовые материалы", generation_failed: "Ошибки создания", ideas_pending: "Идеи на одобрении",
  news_match: "Новости по ключевым словам", source_error: "Проблемы с источниками", support: "Ответы поддержки", low_balance: "Баланс", topup: "Пополнения", plan_low: "Контент-план",
  comments: "Комментарии", team: "Команда", announce: "Новости сервиса", setup: "Настройка", report: "Отчёты",
};

export async function notify(orgId: string, n: Note): Promise<void> {
  try {
    const roles = n.to === "managers" ? ["owner", "admin"] : ["owner", "admin", "editor"];
    const ids = n.userId ? [n.userId] : (await q<{ user_id: string }>(
      "select m.user_id from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=$1 and m.role = any($2::text[]) and u.email not like 'guest-%@guest.invalid' and not u.disabled", [orgId, roles])).map((r) => r.user_id);
    for (const uid of ids) {
      await q("insert into kz_notifications(org_id,user_id,kind,title,body,href,dedupe) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing",
        [orgId, uid, n.kind, n.title.slice(0, 200), (n.body ?? "").slice(0, 400), (n.href ?? "").slice(0, 300), n.dedupe ?? null]);
    }
  } catch { /* уведомления необязательны */ }
}

export interface Notification { id: string; kind: NotifyKind; title: string; body: string; href: string; created_at: string; read_at: string | null }

export async function listNotifications(userId: string, limit = 30, unreadOnly = false): Promise<Notification[]> {
  return q<Notification>(`select id,kind,title,body,href,created_at,read_at from kz_notifications where user_id=$1 ${unreadOnly ? "and read_at is null" : ""} order by created_at desc limit $2`, [userId, limit]).catch(() => []);
}
export async function unreadCount(userId: string): Promise<number> {
  return Number((await one<{ n: string }>("select count(*) n from kz_notifications where user_id=$1 and read_at is null", [userId]).catch(() => null))?.n ?? 0);
}
export async function markRead(userId: string, id: string | "all"): Promise<void> {
  if (id === "all") await q("update kz_notifications set read_at=now() where user_id=$1 and read_at is null", [userId]).catch(() => {});
  else if (/^[0-9a-f-]{36}$/i.test(id)) await q("update kz_notifications set read_at=now() where user_id=$1 and id=$2 and read_at is null", [userId, id]).catch(() => {});
}

/** Уведомить администраторов платформы (по списку PLATFORM_ADMIN_EMAILS) в их собственных кабинетах. */
export async function notifyPlatformAdmins(n: Omit<Note, "userId">): Promise<void> {
  try {
    const emails = (process.env.PLATFORM_ADMIN_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
    if (!emails.length) return;
    const rows = await q<{ id: string; org_id: string }>(
      "select u.id, (select m.org_id from kz_memberships m where m.user_id=u.id order by m.role='owner' desc limit 1) org_id from kz_users u where lower(u.email)=any($1::text[])", [emails]);
    for (const r of rows) if (r.org_id) await notify(r.org_id, { ...n, userId: r.id });
  } catch { /* необязательно */ }
}
