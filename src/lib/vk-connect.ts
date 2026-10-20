import { createHash, randomBytes } from "node:crypto";
import { one, q } from "./db";
import { open, seal } from "./crypto";
import { creds, appOrigin } from "./oauth";
import { call } from "./publishing/vk";
import { PublishError } from "./publishing/types";

/**
 * Личное подключение ВКонтакте через VK ID (OAuth 2.1 + PKCE, публичный клиент): получаем ключ пользователя с правами на стену, фото, видео и сообщества.
 * Это отдельное от входа подключение: оно привязано к организации и пользователю, токены лежат на сервере зашифрованными.
 * ВАЖНО: права wall/photos/video для ключа пользователя VK выдаёт приложению только по запросу в поддержку (devsupport@corp.vk.com), см. docs/vk-integration.md.
 */
const VKID = () => (process.env.VK_ID_BASE?.trim() || "https://id.vk.ru").replace(/\/+$/, "");
export const VK_PUBLISH_SCOPE = () => process.env.VK_PUBLISH_SCOPE?.trim() || "wall photos video groups";
export const connectRedirectUri = (req: Request) => `${appOrigin(req)}/api/vk/connect/callback`;
export const vkConnectConfigured = () => creds("vk") !== null;

export function newPkce() {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function connectUrl(req: Request, state: string, challenge: string): string {
  const c = creds("vk")!;
  const p = new URLSearchParams({ client_id: c.id, redirect_uri: connectRedirectUri(req), response_type: "code", state, code_challenge: challenge, code_challenge_method: "S256", scope: VK_PUBLISH_SCOPE() });
  return `${VKID()}/authorize?${p}`;
}

interface Tok { access_token?: string; refresh_token?: string; expires_in?: number; user_id?: string | number; scope?: string; error?: string; error_description?: string }

async function tokenRequest(body: Record<string, string>): Promise<Tok> {
  const res = await fetch(`${VKID()}/oauth2/auth`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15_000) });
  const j = (await res.json().catch(() => ({}))) as Tok;
  if (!res.ok || j.error || !j.access_token) throw new Error(`VK ID: ${j.error_description ?? j.error ?? `HTTP ${res.status}`}`.slice(0, 200));
  return j;
}

/** Обмен кода на токены и запись подключения (без логов с токенами). */
export async function finishConnect(req: Request, o: { orgId: string; userId: string; code: string; verifier: string; deviceId: string; state: string }): Promise<string> {
  const c = creds("vk");
  if (!c) throw new Error("VK ID не настроен (VK_CLIENT_ID)");
  const t = await tokenRequest({ grant_type: "authorization_code", code: o.code, code_verifier: o.verifier, client_id: c.id, device_id: o.deviceId, redirect_uri: connectRedirectUri(req), state: o.state });
  const me = await fetch(`${VKID()}/oauth2/user_info`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.id, access_token: t.access_token! }), signal: AbortSignal.timeout(15_000) })
    .then((r) => r.json()).catch(() => ({})) as { user?: { user_id?: string | number; first_name?: string; last_name?: string } };
  const vkId = String(me.user?.user_id ?? t.user_id ?? "");
  if (!vkId) throw new Error("VK ID не вернул user_id");
  const name = `${me.user?.first_name ?? ""} ${me.user?.last_name ?? ""}`.trim() || `VK ${vkId}`;
  const row = await one<{ id: string }>(
    `insert into kz_vk_connections(org_id,user_id,vk_user_id,name,scope,secrets,expires_at,status,last_error)
     values($1,$2,$3,$4,$5,$6,now() + ($7 || ' seconds')::interval,'active',null)
     on conflict(org_id,vk_user_id) do update set user_id=$2,name=$4,scope=$5,secrets=$6,expires_at=excluded.expires_at,status='active',last_error=null,updated_at=now()
     returning id`,
    [o.orgId, o.userId, vkId, name, t.scope ?? VK_PUBLISH_SCOPE(), JSON.stringify(seal({ access: t.access_token!, refresh: t.refresh_token ?? "", device: o.deviceId })), String(Math.max(60, Number(t.expires_in) || 3600))]);
  // каналы, отключённые из-за прошлого сбоя этого подключения, снова работают
  await q("update kz_channels set status='active' where connection_id=$1 and status='reauth'", [row!.id]);
  return row!.id;
}

/** Нужна повторная авторизация: повтор задания не поможет, пока пользователь не подключится заново. */
export class ReauthError extends PublishError { constructor(m: string) { super(m, false); } }

/** Рабочий ключ доступа подключения организации: при истечении срока обновляем по refresh-токену; при отказе помечаем «нужна повторная авторизация». */
export async function connectionToken(orgId: string, connectionId: string): Promise<string> {
  const r = await one<{ secrets: unknown; expires_at: string | null; status: string }>("select secrets,expires_at,status from kz_vk_connections where id=$1 and org_id=$2", [connectionId, orgId]);
  if (!r) throw new ReauthError("Подключение ВКонтакте удалено. Подключите заново на странице «Каналы»");
  if (r.status === "reauth") throw new ReauthError("Нужна повторная авторизация ВКонтакте (страница «Каналы»)");
  const s = open(r.secrets);
  const fresh = r.expires_at && new Date(r.expires_at).getTime() - Date.now() > 60_000;
  if (fresh && s.access) return s.access;
  const c = creds("vk");
  if (!c || !s.refresh || !s.device) { await markReauth(connectionId, "Нет данных для обновления ключа"); throw new ReauthError("Нужна повторная авторизация ВКонтакте"); }
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh, client_id: c.id, device_id: s.device, state: randomBytes(8).toString("hex") });
    await q("update kz_vk_connections set secrets=$2, expires_at=now() + ($3 || ' seconds')::interval, updated_at=now() where id=$1",
      [connectionId, JSON.stringify(seal({ access: t.access_token!, refresh: t.refresh_token || s.refresh, device: s.device })), String(Math.max(60, Number(t.expires_in) || 3600))]);
    return t.access_token!;
  } catch (e) {
    // отозванное разрешение или просроченный refresh — повтор не поможет; сетевой сбой оставляем временным
    if (/HTTP 4|invalid|expired|revoked|denied/i.test((e as Error).message)) { await markReauth(connectionId, (e as Error).message); throw new ReauthError("Доступ ВКонтакте отозван или истёк — авторизуйтесь заново на странице «Каналы»"); }
    throw e;
  }
}

async function markReauth(id: string, why: string) {
  await q("update kz_vk_connections set status='reauth', last_error=$2, updated_at=now() where id=$1", [id, why.slice(0, 300)]);
  await q("update kz_channels set status='reauth' where connection_id=$1 and status='active'", [id]);
}

export interface VkGroup { id: string; name: string; photo: string; type: string; canPost: boolean }

/** Сообщества, где пользователь администратор или редактор. Права берём из ответа VK; «можно публиковать» — только если VK отдал роль. */
export async function listGroups(orgId: string, connectionId: string): Promise<VkGroup[]> {
  const token = await connectionToken(orgId, connectionId);
  const r = await call<{ items?: { id: number; name: string; photo_50?: string; type?: string; is_admin?: number; admin_level?: number }[] }>(token, "groups.get", { extended: "1", filter: "admin,editor", fields: "photo_50", count: "200" });
  return (r.items ?? []).map((g) => ({ id: String(g.id), name: g.name, photo: g.photo_50 ?? "", type: g.type ?? "group", canPost: (g.admin_level ?? 0) >= 2 || g.is_admin === 1 }));
}

/** Данные канала для провайдера: у канала с личным подключением токен берётся (и при необходимости обновляется) из подключения. */
export async function resolveCred(orgId: string, ch: { credentials: unknown; connection_id?: string | null }): Promise<Record<string, string>> {
  const c = open(ch.credentials);
  if (ch.connection_id) { c.token = await connectionToken(orgId, ch.connection_id); c.mode = "user"; }
  return c;
}
