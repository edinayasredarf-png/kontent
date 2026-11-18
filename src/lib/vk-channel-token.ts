import { tx } from "./db";
import { open, seal } from "./crypto";
import { creds } from "./oauth";

/** Refresh under a row lock: two workers cannot consume the same rotating refresh token. */
export async function vkChannelCredentials(orgId: string, channelId: string, encrypted: unknown) {
  const cached = open(encrypted);
  if (cached.oauth !== "vk" || Number(cached.expiresAt) > Date.now() + 120_000) return cached;
  return tx(async run => {
    const [row] = await run<{ credentials: unknown }>("select credentials from kz_channels where id=$1 and org_id=$2 and kind='vk' for update", [channelId, orgId]);
    if (!row) throw new Error("Канал VK удалён");
    const current = open(row.credentials);
    if (current.oauth !== "vk" || Number(current.expiresAt) > Date.now() + 120_000) return current;
    const client = creds("vk");
    if (!current.refreshToken || !client) throw new Error("Доступ VK истёк. Подключите сообщество заново.");
    const response = await fetch(`${(process.env.VK_ID_BASE?.trim() || "https://id.vk.ru").replace(/\/+$/, "")}/oauth2/auth`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(20_000),
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: current.refreshToken, client_id: client.id, device_id: current.deviceId }),
    });
    const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!response.ok || !token.access_token) throw new Error("VK отозвал доступ к сообществу. Подключите его заново.");
    const updated = { ...current, token: token.access_token, photoToken: token.access_token, refreshToken: token.refresh_token || current.refreshToken, expiresAt: String(Date.now() + Number(token.expires_in || 3600) * 1000) };
    await run("update kz_channels set credentials=$3 where id=$1 and org_id=$2", [channelId, orgId, JSON.stringify(seal(updated))]);
    return updated;
  });
}
