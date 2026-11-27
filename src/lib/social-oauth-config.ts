import { isIP } from "node:net";
import { isPrivateIp } from "./safefetch";
import { one } from "./db";
import { open } from "./crypto";
import { SITE } from "./site";
import { APP_DETAILS, appFamily, type AppFamily, type SocialProvider } from "./social-oauth-catalog";
export interface SocialApp { id: string; secret: string; applicationKey: string }
const clean = (s?: string) => (s || "").trim();
export async function socialAppConfig(provider: SocialProvider | AppFamily): Promise<SocialApp | null> {
  const family = provider === "meta" ? "meta" : appFamily(provider), prefix = APP_DETAILS[family].env;
  const saved = await one<{ value: unknown }>("select value from kz_platform_settings where key=$1", [`oauth:${family}`]);
  const stored = saved ? open(saved.value) : null;
  const id = clean(stored ? stored.id : process.env[`${prefix}_CLIENT_ID`]);
  const secret = clean(stored ? stored.secret : process.env[`${prefix}_CLIENT_SECRET`]);
  const applicationKey = clean(stored ? stored.applicationKey : process.env[`${prefix}_APPLICATION_KEY`]);
  return id && secret && (family !== "ok" || applicationKey) ? { id, secret, applicationKey } : null;
}
export function socialRedirectUri(provider: SocialProvider): string {
  const u = new URL(process.env.APP_URL?.trim() || SITE);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (u.protocol !== "https:" || u.username || u.password || host === "localhost" || host.endsWith(".local") || isIP(host) && isPrivateIp(host)) throw new Error("Для OAuth нужен публичный HTTPS-адрес в APP_URL");
  return `${u.origin}/api/channels/oauth/${provider}/callback`;
}
