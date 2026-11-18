import { createHash, randomBytes } from "node:crypto";
import { one, q, tx } from "./db";
import { open, seal } from "./crypto";
import { call as vkCall } from "./publishing/vk";
import { telegram, telegramCall } from "./publishing/telegram";
import { newPkce, creds } from "./oauth";

export type ConnectionProvider = "vk" | "telegram";
export interface ConnectionOption { id: string; title: string; avatar?: string }
interface Connection { id: string; org_id: string; user_id: string; brand_id: string; factory_id: string | null; provider: ConnectionProvider; status: string; payload: unknown; error: string | null }
export const hashState = (value: string) => createHash("sha256").update(value).digest("hex");
export const telegramBotName = () => (process.env.TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
export const channelConnectConfigured = (provider: ConnectionProvider) => provider === "vk" ? !!creds("vk") : !!process.env.TELEGRAM_BOT_TOKEN?.trim() && !!telegramBotName() && !!process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const origin = () => (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
export const vkChannelCallback = () => `${origin()}/api/oauth/vk/callback`;
const vkId = () => (process.env.VK_ID_BASE?.trim() || "https://id.vk.ru").replace(/\/+$/, "");

export async function startConnection(orgId: string, userId: string, brandId: string, provider: ConnectionProvider, factoryId?: string, channelId?: string) {
  if (!channelConnectConfigured(provider)) throw new Error(provider === "vk" ? "Подключение VK пока не настроено администратором" : "Бот Telegram пока не настроен администратором");
  if (!await one("select id from kz_brands where id=$1 and org_id=$2", [brandId, orgId])) throw new Error("Выберите бренд");
  if (factoryId && !await one("select id from kz_factories where id=$1 and org_id=$2 and brand_id=$3", [factoryId, orgId, brandId])) throw new Error("Завод не принадлежит выбранному бренду");
  let expectedTarget = "";
  if (channelId) {
    const channel = await one<{ credentials: unknown }>("select credentials from kz_channels where id=$1 and org_id=$2 and brand_id=$3 and kind=$4", [channelId, orgId, brandId, provider]);
    if (!channel) throw new Error("Канал не принадлежит выбранному бренду");
    expectedTarget = open(channel.credentials).target.replace(/^-/, "");
  }
  await q("update kz_channel_connections set status='failed',payload='{}',error='Срок подключения истёк' where org_id=$1 and user_id=$2 and expires_at<now() and status not in ('failed','used')", [orgId, userId]);
  const state = (provider === "vk" ? "channel_" : "") + randomBytes(24).toString("base64url"), pkce = newPkce();
  if (provider === "vk" && !/^https:\/\//.test(origin())) throw new Error("Укажите HTTPS адрес сайта в APP_URL");
  const row = await one<{ id: string }>("insert into kz_channel_connections(org_id,user_id,brand_id,factory_id,provider,state_hash,payload) values($1,$2,$3,$4,$5,$6,$7) returning id", [orgId, userId, brandId, factoryId || null, provider, hashState(state), JSON.stringify(seal({ verifier: pkce.verifier, expectedTarget }))]);
  let url: string;
  if (provider === "telegram") url = `https://t.me/${telegramBotName()}?start=${state}`;
  else {
    const params = new URLSearchParams({ client_id: creds("vk")!.id, redirect_uri: vkChannelCallback(), response_type: "code", state, code_challenge: pkce.challenge, code_challenge_method: "S256", scope: "groups wall photos" });
    url = `${vkId()}/authorize?${params}`;
  }
  return { id: row!.id, url };
}

export async function ownedConnection(orgId: string, userId: string, id: string) {
  return one<Connection>("select * from kz_channel_connections where id=$1 and org_id=$2 and user_id=$3 and expires_at>now()", [id, orgId, userId]);
}

/** Callback is bound to the signed-in workspace/user, PKCE and one-use state. */
export async function finishVkConnection(orgId: string, userId: string, state: string, code: string, deviceId: string) {
  const row = await one<Connection>("update kz_channel_connections set status='exchanging' where state_hash=$1 and org_id=$2 and user_id=$3 and provider='vk' and status='pending' and expires_at>now() returning *", [hashState(state), orgId, userId]);
  if (!row) throw new Error("Ссылка подключения истекла или уже использована. Начните подключение заново.");
  try {
    const { verifier, expectedTarget } = open(row.payload);
    const response = await fetch(`${vkId()}/oauth2/auth`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: creds("vk")!.id, redirect_uri: vkChannelCallback(), code, state, device_id: deviceId, code_verifier: verifier }), signal: AbortSignal.timeout(20_000) });
    const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !token.access_token) throw new Error("VK не выдал доступ. Проверьте права приложения на сообщества, стену и фотографии.");
    const groups = await vkCall<{ count: number; items: { id: number; name: string; photo_100?: string; is_admin?: number; admin_level?: number }[] }>(token.access_token, "groups.get", { extended: "1", filter: "admin,editor", fields: "photo_100,is_admin,admin_level", count: "1000" });
    const options = groups.items.filter(g => (g.is_admin || (g.admin_level ?? 0) >= 2) && (!expectedTarget || String(g.id) === expectedTarget)).map(g => ({ id: String(g.id), title: g.name, avatar: g.photo_100 }));
    if (!options.length) throw new Error("VK не вернул сообщества, где у вас есть право публикации.");
    await q("update kz_channel_connections set status='ready',payload=$2 where id=$1", [row.id, JSON.stringify(seal({ token: token.access_token, refreshToken: token.refresh_token ?? "", expiresAt: String(Date.now() + Number(token.expires_in || 3600) * 1000), deviceId, options: JSON.stringify(options) }))]);
    return row.id;
  } catch (e) {
    const error = /код (27|1051)/.test((e as Error).message) ? "Приложению VK не разрешён доступ к API сообществ. В кабинете VK запросите права «Сообщества», «Стена» и «Фотографии»." : (e as Error).message.slice(0, 300);
    await q("update kz_channel_connections set status='failed',payload='{}',error=$2 where id=$1", [row.id, error]);
    return row.id;
  }
}

export async function connectionStatus(orgId: string, userId: string, id: string) {
  const row = await ownedConnection(orgId, userId, id);
  if (!row) return { status: "expired", options: [] as ConnectionOption[] };
  const payload = open(row.payload);
  return { status: row.status, options: row.status === "ready" ? JSON.parse(payload.options || "[]") as ConnectionOption[] : [], error: row.error };
}

export async function connectSelected(orgId: string, userId: string, id: string, target: string) {
  const row = await ownedConnection(orgId, userId, id);
  if (!row || row.status !== "ready") throw new Error("Подключение истекло или уже завершено");
  const payload = open(row.payload), options = JSON.parse(payload.options || "[]") as ConnectionOption[];
  const option = options.find(o => o.id === target);
  if (!option) throw new Error("Выберите канал из списка");
  let credentials: Record<string, string>;
  if (row.provider === "vk") {
    await vkCall(payload.token, "photos.getWallUploadServer", { group_id: target });
    credentials = { token: payload.token, photoToken: payload.token, target, refreshToken: payload.refreshToken, expiresAt: payload.expiresAt, deviceId: payload.deviceId, oauth: "vk" };
  } else {
    await telegram.verify({ shared: "1", target });
    const member = await telegramCall<{ status: string }>(process.env.TELEGRAM_BOT_TOKEN!.trim(), "getChatMember", { chat_id: target, user_id: Number(payload.telegramUserId) });
    if (!["administrator", "creator"].includes(member.status)) throw new Error("Ваш аккаунт Telegram не администратор канала");
    credentials = { shared: "1", target };
  }
  return tx(async run => {
    const lock = await run("select id from kz_channel_connections where id=$1 and org_id=$2 and user_id=$3 and status='ready' and expires_at>now() for update", [id, orgId, userId]);
    if (!lock.length) throw new Error("Подключение уже завершено");
    // Serialize connections within an organization to prevent duplicate channel inserts.
    await run("select id from kz_orgs where id=$1 for update", [orgId]);
    const existing = await run<{ id: string; brand_id: string; credentials: unknown }>("select id,brand_id,credentials from kz_channels where org_id=$1 and kind=$2", [orgId, row.provider]);
    const known = existing.find(c => open(c.credentials).target?.replace(/^-/, "") === target.replace(/^-/, ""));
    if (known && known.brand_id !== row.brand_id) throw new Error("Этот канал уже подключён к другому бренду");
    const [channel] = known ? await run<{ id: string }>("update kz_channels set credentials=$3,title=$4,status='active' where id=$1 and org_id=$2 returning id", [known.id, orgId, JSON.stringify(seal(credentials)), option.title]) : await run<{ id: string }>("insert into kz_channels(org_id,brand_id,kind,title,credentials) values($1,$2,$3,$4,$5) returning id", [orgId, row.brand_id, row.provider, option.title, JSON.stringify(seal(credentials))]);
    if (row.factory_id) await run("update kz_factories set channel_ids=array_append(channel_ids,$3::uuid) where id=$1 and org_id=$2 and brand_id=$4 and not ($3::uuid=any(channel_ids))", [row.factory_id, orgId, channel.id, row.brand_id]);
    await run("update kz_channel_connections set status='used',payload='{}' where id=$1", [id]);
    return { title: option.title, factoryId: row.factory_id };
  });
}
