import { api, bearer } from "./publishing/http";
import { okGroups, okSessionSecret } from "./publishing/ok";
import { socialAppConfig, socialRedirectUri, type SocialApp } from "./social-oauth-config";
import { SOCIAL_NAMES, type SocialProvider } from "./social-oauth-catalog";
export interface SocialOption { id: string; title: string; credentials: Record<string, string> }
export const SCOPES: Record<SocialProvider, string> = {
  pinterest: "boards:read,pins:write,user_accounts:read",
  ok: "VALUABLE_ACCESS;GROUP_CONTENT;PHOTO_CONTENT;PUBLISH_TO_STREAM;LONG_ACCESS_TOKEN",
  facebook: "pages_show_list,pages_read_engagement,pages_manage_posts",
  instagram: "pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish",
  threads: "threads_basic,threads_content_publish",
};
export function socialAuthorizeUrl(provider: SocialProvider, app: SocialApp, state: string): string {
  const base = { pinterest: "https://www.pinterest.com/oauth/", ok: "https://connect.ok.ru/oauth/authorize", facebook: "https://www.facebook.com/v27.0/dialog/oauth", instagram: "https://www.facebook.com/v27.0/dialog/oauth", threads: "https://threads.com/oauth/authorize" }[provider];
  const p = new URLSearchParams({ client_id: app.id, redirect_uri: socialRedirectUri(provider), response_type: "code", scope: SCOPES[provider], state });
  return `${base}?${p}`;
}
async function formToken(label: string, url: string, fields: Record<string, string>, headers?: Record<string, string>) {
  return api(label, url, { method: "POST", headers, body: new URLSearchParams(fields) });
}
function tokenCredentials(j: Record<string, unknown>, provider: SocialProvider, app: SocialApp): Record<string, string> {
  if (typeof j.access_token !== "string" || !j.access_token) throw new Error(`${SOCIAL_NAMES[provider]} не выдал токен доступа. Проверьте права приложения.`);
  if (provider === "pinterest" && typeof j.scope === "string" && !["boards:read", "pins:write"].every(scope => (j.scope as string).split(/[ ,]+/).includes(scope))) throw new Error("Pinterest не выдал разрешения на чтение досок и публикацию пинов. Подключите аккаунт заново.");
  const expires = Number(j.expires_in);
  return { token: j.access_token, refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : "", expiresAt: Number.isFinite(expires) && expires > 0 ? String(Date.now() + expires * 1000) : "", oauth: provider, appId: app.id, ...(provider === "ok" ? { applicationKey: app.applicationKey, sessionSecret: okSessionSecret(j.access_token, app.secret) } : {}) };
}
export async function exchangeSocialCode(provider: SocialProvider, code: string, app: SocialApp): Promise<Record<string, string>> {
  const redirect_uri = socialRedirectUri(provider), label = SOCIAL_NAMES[provider];
  if (provider === "pinterest") return tokenCredentials(await formToken(label, "https://api.pinterest.com/v5/oauth/token", { grant_type: "authorization_code", code, redirect_uri, continuous_refresh: "true" }, { Authorization: `Basic ${Buffer.from(`${app.id}:${app.secret}`).toString("base64")}` }), provider, app);
  if (provider === "ok") return tokenCredentials(await formToken(label, "https://api.ok.ru/oauth/token.do", { grant_type: "authorization_code", code, redirect_uri, client_id: app.id, client_secret: app.secret }), provider, app);
  if (provider === "threads") {
    const short = tokenCredentials(await formToken(label, "https://graph.threads.com/oauth/access_token", { grant_type: "authorization_code", code, redirect_uri, client_id: app.id, client_secret: app.secret }), provider, app);
    const j = await api(label, `https://graph.threads.com/access_token?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: app.secret, access_token: short.token })}`);
    return tokenCredentials(j, provider, app);
  }
  const short = tokenCredentials(await formToken(label, "https://graph.facebook.com/v27.0/oauth/access_token", { code, redirect_uri, client_id: app.id, client_secret: app.secret }), provider, app);
  const long = await api(label, `https://graph.facebook.com/v27.0/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.id, client_secret: app.secret, fb_exchange_token: short.token })}`);
  return tokenCredentials(long, provider, app);
}
export async function socialOptions(provider: SocialProvider, credentials: Record<string, string>): Promise<SocialOption[]> {
  if (provider === "ok") return (await okGroups(credentials)).map(g => ({ ...g, credentials: { ...credentials, target: g.id } }));
  if (provider === "threads") {
    const j = await api("Threads", "https://graph.threads.com/v1.0/me?fields=id,username", { headers: bearer(credentials.token) });
    if (typeof j.id !== "string") throw new Error("Threads не вернул профиль.");
    return [{ id: j.id, title: String(j.username || "Threads"), credentials: { ...credentials, target: j.id } }];
  }
  const result: SocialOption[] = []; let cursor = "";
  for (let page = 0; page < 20; page++) {
    if (provider === "pinterest") {
      const j = await api("Pinterest", `https://api.pinterest.com/v5/boards?${new URLSearchParams({ page_size: "100", ...(cursor ? { bookmark: cursor } : {}) })}`, { headers: bearer(credentials.token) });
      if (!Array.isArray(j.items)) throw new Error("Pinterest не вернул список досок.");
      for (const board of j.items as { id?: string; name?: string }[]) if (board.id) result.push({ id: board.id, title: board.name || `Доска ${board.id}`, credentials: { ...credentials, target: board.id } });
      const next = typeof j.bookmark === "string" ? j.bookmark : "";
      if (!next) return result;
      if (next === cursor) throw new Error("Pinterest не удалось прочитать следующую страницу досок.");
      cursor = next;
    } else {
      const fields = provider === "instagram" ? "id,name,access_token,tasks,instagram_business_account{id,username}" : "id,name,access_token,tasks";
      const j = await api("Meta", `https://graph.facebook.com/v27.0/me/accounts?${new URLSearchParams({ fields, limit: "100", ...(cursor ? { after: cursor } : {}) })}`, { headers: bearer(credentials.token) });
      if (!Array.isArray(j.data)) throw new Error("Meta не вернула страницы пользователя.");
      for (const p of j.data as { id: string; name: string; access_token?: string; tasks?: string[]; instagram_business_account?: { id: string; username: string } }[]) {
        if (!p.access_token || !p.tasks?.some(t => ["CREATE_CONTENT", "MANAGE", "PROFILE_PLUS_CREATE_CONTENT", "PROFILE_PLUS_FULL_CONTROL"].includes(t))) continue;
        const target = provider === "instagram" ? p.instagram_business_account?.id : p.id;
        if (target) result.push({ id: target, title: provider === "instagram" ? p.instagram_business_account!.username || p.name : p.name, credentials: { token: p.access_token, target, oauth: provider, appId: credentials.appId } });
      }
      const paging = j.paging as { next?: string; cursors?: { after?: string } } | undefined;
      if (!paging?.next) return result;
      const next = paging.cursors?.after;
      if (!next || next === cursor) throw new Error("Meta не удалось прочитать следующую страницу аккаунтов.");
      cursor = next;
    }
  }
  throw new Error("Аккаунтов слишком много: не удалось завершить получение списка. Обратитесь в поддержку.");
}
export async function refreshSocialToken(provider: SocialProvider, c: Record<string, string>): Promise<Record<string, string>> {
  const app = await socialAppConfig(provider);
  if (!app || app.id !== c.appId) throw new Error("Приложение соцсети изменилось. Подключите аккаунт заново.");
  let j: Record<string, unknown>;
  if (provider === "pinterest") {
    if (!c.refreshToken) throw new Error("Pinterest: подключите аккаунт заново для обновления доступа.");
    j = await formToken("Pinterest", "https://api.pinterest.com/v5/oauth/token", { grant_type: "refresh_token", refresh_token: c.refreshToken }, { Authorization: `Basic ${Buffer.from(`${app.id}:${app.secret}`).toString("base64")}` });
  } else if (provider === "ok") {
    if (!c.refreshToken) return c; // LONG_ACCESS_TOKEN is extended by OK when the API is used.
    j = await formToken("Одноклассники", "https://api.ok.ru/oauth/token.do", { grant_type: "refresh_token", refresh_token: c.refreshToken, client_id: app.id, client_secret: app.secret });
  } else if (provider === "threads") j = await api("Threads", `https://graph.threads.com/refresh_access_token?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: c.token })}`);
  else return c; // Page tokens obtained with a long-lived user token are checked by the publishing API.
  const next = tokenCredentials(j, provider, app);
  return { ...c, ...next, refreshToken: next.refreshToken || c.refreshToken || "" };
}
