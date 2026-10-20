"use server";
import { revalidatePath } from "next/cache";
import { requireWriter } from "./auth";
import { one, q } from "./db";
import { open, seal } from "./crypto";
import { call } from "./publishing/vk";
import { connectionToken, listGroups, type VkGroup } from "./vk-connect";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const msg = (e: unknown) => ((e as Error).message || "Ошибка").slice(0, 300);

/** Сообщества, где пользователь администратор или редактор. Подключение берём только из своей организации. */
export async function vkGroupsAction(connectionId: string): Promise<R<{ groups: VkGroup[] }>> {
  const c = await requireWriter();
  try { return { ok: true, groups: await listGroups(c.org.id, String(connectionId)) }; } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Подключить выбранное сообщество как канал. Права на сообщество перепроверяем на сервере по ответу VK, а не по данным из браузера. */
export async function vkAddChannelAction(connectionId: string, groupId: string, brandId: string): Promise<R<{ title: string }>> {
  const c = await requireWriter();
  if (!/^\d{1,12}$/.test(String(groupId))) return { ok: false, error: "Неверный id сообщества" };
  if (!(await one("select 1 from kz_brands where id=$1 and org_id=$2", [brandId, c.org.id]))) return { ok: false, error: "Выберите бренд" };
  try {
    const g = (await listGroups(c.org.id, String(connectionId))).find((x) => x.id === String(groupId));
    if (!g) return { ok: false, error: "Это сообщество недоступно: нужны права администратора или редактора" };
    if (!g.canPost) return { ok: false, error: "У вас нет права публиковать в этом сообществе" };
    const dup = (await q<{ id: string; credentials: unknown }>("select id,credentials from kz_channels where org_id=$1 and connection_id=$2", [c.org.id, connectionId]));
    if (dup.some((d) => { try { return open(d.credentials).target === g.id; } catch { return false; } })) return { ok: false, error: "Это сообщество уже подключено" };
    await q("insert into kz_channels(org_id,brand_id,kind,title,credentials,connection_id) values($1,$2,'vk',$3,$4,$5)", [c.org.id, brandId, g.name, JSON.stringify(seal({ target: g.id })), connectionId]);
    revalidatePath("/app", "layout");
    return { ok: true, title: g.name };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Проверка подключения: ключ жив, права на месте. При отказе VK подключение помечается «нужна повторная авторизация». */
export async function vkCheckConnectionAction(connectionId: string): Promise<R<{ name: string }>> {
  const c = await requireWriter();
  try {
    const token = await connectionToken(c.org.id, String(connectionId));
    await call(token, "groups.get", { count: "1", filter: "admin,editor" });
    await q("update kz_vk_connections set status='active', last_error=null, updated_at=now() where id=$1 and org_id=$2", [connectionId, c.org.id]);
    const r = await one<{ name: string }>("select name from kz_vk_connections where id=$1 and org_id=$2", [connectionId, c.org.id]);
    revalidatePath("/app/channels");
    return { ok: true, name: r?.name ?? "" };
  } catch (e) {
    const m = msg(e);
    // код 5 — ключ недействителен, 7 и 15 — права отозваны
    if (/код (5|7|15)\)/.test(m)) {
      await q("update kz_vk_connections set status='reauth', last_error=$3, updated_at=now() where id=$1 and org_id=$2", [connectionId, c.org.id, m]);
      await q("update kz_channels set status='reauth' where connection_id=$1 and org_id=$2 and status='active'", [connectionId, c.org.id]);
      revalidatePath("/app/channels");
    }
    return { ok: false, error: m };
  }
}

/** Отключение: токены стираются, каналы этого подключения останавливаются (при повторном подключении того же аккаунта они снова включатся). */
export async function vkDisconnectAction(connectionId: string): Promise<R> {
  const c = await requireWriter();
  const r = await q("update kz_vk_connections set secrets='{}'::jsonb, status='disconnected', last_error=null, expires_at=null, updated_at=now() where id=$1 and org_id=$2 returning id", [connectionId, c.org.id]);
  if (!r.length) return { ok: false, error: "Подключение не найдено" };
  await q("update kz_channels set status='reauth' where connection_id=$1 and org_id=$2", [connectionId, c.org.id]);
  revalidatePath("/app", "layout");
  return { ok: true };
}
