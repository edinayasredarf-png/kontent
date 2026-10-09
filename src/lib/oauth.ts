import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { one, q, tx } from "./db";
import { createAccount, defaultOrg, type Session } from "./auth";

export type Provider = "yandex" | "vk";
export const PROVIDERS: Provider[] = ["yandex", "vk"];
export const PROVIDER_NAME: Record<Provider, string> = { yandex: "Яндекс", vk: "VK" };

/**
 * Яндекс: ID приложения + пароль приложения (client secret).
 * VK: приложение VK ID (id.vk.com) — публичный клиент с PKCE, секрет не нужен: достаточно ID приложения (VK_CLIENT_ID).
 * Имена переменных те же, что на единойсреде (NEXT_PUBLIC_*_CLIENT_ID) — можно скопировать как есть.
 */
export function creds(p: Provider): { id: string; secret: string } | null {
  const E = process.env;
  const id = (p === "yandex" ? E.YANDEX_CLIENT_ID || E.NEXT_PUBLIC_YANDEX_CLIENT_ID : E.VK_CLIENT_ID || E.NEXT_PUBLIC_VK_CLIENT_ID)?.trim();
  if (!id) return null;
  if (p === "vk") return { id, secret: "" };
  const secret = E.YANDEX_CLIENT_SECRET?.trim();
  return secret ? { id, secret } : null;
}

const VKID = () => (process.env.VK_ID_BASE?.trim() || "https://id.vk.ru").replace(/\/+$/, "");
const YA_OAUTH = () => (process.env.YANDEX_OAUTH_BASE?.trim() || "https://oauth.yandex.ru").replace(/\/+$/, "");
const YA_LOGIN = () => (process.env.YANDEX_LOGIN_BASE?.trim() || "https://login.yandex.ru").replace(/\/+$/, "");

/** PKCE (RFC 7636): verifier остаётся у нас в httpOnly-cookie, провайдеру уходит только его SHA-256. Перехваченный код без verifier бесполезен. */
export function newPkce() {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
export const configured = (p: Provider) => creds(p) !== null;

/** Адрес сайта для redirect_uri. Должен буква в букву совпадать с адресом, указанным в настройках приложения провайдера. */
export function appOrigin(req: Request): string {
  const fixed = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
export const redirectUri = (req: Request, p: Provider) => `${appOrigin(req)}/api/oauth/${p}/callback`;

export function authorizeUrl(req: Request, p: Provider, state: string, challenge?: string): string {
  const c = creds(p)!;
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri(req, p), response_type: "code", state });
  if (p === "yandex") { q.set("scope", "login:email login:info"); return `${YA_OAUTH()}/authorize?${q}`; }
  q.set("code_challenge", challenge ?? ""); q.set("code_challenge_method", "S256");
  // email у VK ID выдаётся только если право «email» включено в настройках приложения; по умолчанию просим минимум
  const scope = process.env.VK_SCOPE?.trim();
  if (scope) q.set("scope", scope);
  return `${VKID()}/authorize?${q}`;
}

/**
 * Профиль по access_token из виджета VK ID. Токену из браузера не верим на слово: спрашиваем VK, чей он, — токен другого приложения
 * или поддельный VK отклонит. Всё, что попадёт в аккаунт (id, имя, email), берётся из ответа VK, а не из тела запроса.
 */
export async function vkProfileFromToken(accessToken: string): Promise<Profile> {
  const c = creds("vk");
  if (!c) throw new Error("VK ID не настроен (VK_CLIENT_ID)");
  const res = await fetch(`${VKID()}/oauth2/user_info`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({ client_id: c.id, access_token: accessToken }),
  });
  const me = await json(res, "VK ID user_info");
  const u = (me.user ?? {}) as { user_id?: string | number; first_name?: string; last_name?: string; email?: string };
  if (!u.user_id) throw new Error("VK ID не вернул user_id");
  return { id: String(u.user_id), email: u.email ? String(u.email).toLowerCase() : null, name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() };
}

/**
 * Профиль по access_token из кнопки Яндекс ID (SDK YaAuthSuggest). Токен проверяем у Яндекса, а не верим браузеру: профиль берётся из ответа.
 * Токен мог быть выдан другому приложению (чужой сайт получил токен пользователя) — поэтому сверяем client_id из ответа с нашим.
 */
export async function yandexProfileFromToken(accessToken: string): Promise<Profile> {
  const c = creds("yandex");
  if (!c) throw new Error("Яндекс ID не настроен");
  const me = await json(await fetch(`${YA_LOGIN()}/info?format=json`, { headers: { Authorization: `OAuth ${accessToken}` }, signal: AbortSignal.timeout(15_000) }), "Яндекс info");
  if (me.client_id && String(me.client_id) !== c.id) throw new Error("Токен выдан другому приложению");
  if (!me.id) throw new Error("Яндекс не вернул id");
  const email = String(me.default_email ?? (me.emails as string[] | undefined)?.[0] ?? "").toLowerCase();
  return { id: String(me.id), email: email || null, name: String(me.real_name ?? me.display_name ?? `${me.first_name ?? ""} ${me.last_name ?? ""}`).trim() };
}

/** Заблокированный администратором пользователь не входит и через Яндекс/VK. */
async function assertActive(userId: string, run: typeof q = q) {
  const [u] = await run<{ disabled: boolean }>("select disabled from kz_users where id=$1", [userId]);
  if (u?.disabled) throw new Error("Аккаунт заблокирован");
}

export interface Profile { id: string; email: string | null; name: string }

async function json(res: Response, what: string) {
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j as { error?: unknown }).error) throw new Error(`${what}: ${res.status} ${JSON.stringify((j as { error_description?: string; error?: unknown }).error_description ?? (j as { error?: unknown }).error ?? "").slice(0, 120)}`);
  return j as Record<string, unknown>;
}

/** Обмен кода на токен и профиль. Все запросы — с сервера, секрет приложения и токены в браузер не попадают. */
export async function fetchProfile(req: Request, p: Provider, code: string, x: { verifier?: string; deviceId?: string; state?: string } = {}): Promise<Profile> {
  const c = creds(p)!;
  const t = AbortSignal.timeout(15_000);
  const form = (o: Record<string, string>) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: t, body: new URLSearchParams(o) });
  if (p === "yandex") {
    const tok = await json(await fetch(`${YA_OAUTH()}/token`, form({ grant_type: "authorization_code", code, client_id: c.id, client_secret: c.secret })), "Яндекс token");
    const me = await json(await fetch(`${YA_LOGIN()}/info?format=json`, { headers: { Authorization: `OAuth ${tok.access_token}` }, signal: t }), "Яндекс info");
    const email = String(me.default_email ?? (me.emails as string[] | undefined)?.[0] ?? "").toLowerCase();
    return { id: String(me.id), email: email || null, name: String(me.real_name ?? me.display_name ?? `${me.first_name ?? ""} ${me.last_name ?? ""}`).trim() };
  }
  // VK ID: код + code_verifier + device_id → токен → профиль
  if (!x.verifier || !x.deviceId) throw new Error("VK не вернул device_id или потерян code_verifier");
  const tok = await json(await fetch(`${VKID()}/oauth2/auth`, form({
    grant_type: "authorization_code", code, code_verifier: x.verifier, client_id: c.id, device_id: x.deviceId, redirect_uri: redirectUri(req, p), state: x.state ?? "",
  })), "VK ID token");
  if (!tok.access_token) throw new Error("VK ID не вернул access_token");
  const me = await json(await fetch(`${VKID()}/oauth2/user_info`, form({ client_id: c.id, access_token: String(tok.access_token) })), "VK ID user_info");
  const u = (me.user ?? {}) as { user_id?: string | number; first_name?: string; last_name?: string; email?: string };
  const id = String(u.user_id ?? tok.user_id ?? "");
  if (!id) throw new Error("VK ID не вернул user_id");
  return { id, email: u.email ? String(u.email).toLowerCase() : null, name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() };
}

/**
 * Кто этот человек у нас: 1) уже входил этим аккаунтом; 2) есть пользователь с тем же email — привязываем (провайдер
 * подтверждает email); 3) новый — создаём пользователя и организацию. Без email (VK мог не отдать) заводим служебный адрес.
 */
export async function resolveUser(p: Provider, prof: Profile, refCode?: string): Promise<Session> {
  const known = await one<{ user_id: string }>("select user_id from kz_oauth_identities where provider=$1 and provider_id=$2", [p, prof.id]);
  if (known) {
    await assertActive(known.user_id);
    const org = await defaultOrg(known.user_id);
    if (!org) throw new Error("У пользователя нет организации");
    return { uid: known.user_id, org };
  }
  const email = prof.email ?? `${p}-${prof.id}@oauth.invalid`;
  return tx(async (run) => {
    const [ex] = await run<{ id: string }>("select id from kz_users where email=$1", [email]);
    let s: Session;
    if (ex) {
      await assertActive(ex.id, run);
      const org = await defaultOrg(ex.id);
      if (!org) throw new Error("У пользователя нет организации");
      s = { uid: ex.id, org };
    } else {
      // пароль случайный и никому не известен: войти по паролю в такой аккаунт нельзя, только через провайдера
      s = await createAccount(run, email, prof.name, await bcrypt.hash(randomBytes(24).toString("hex"), 8), prof.name ? `Организация ${prof.name}` : "Моя организация", { refCode, hasPassword: false, consent: true });
    }
    await run("insert into kz_oauth_identities(provider,provider_id,user_id) values($1,$2,$3) on conflict do nothing", [p, prof.id, s.uid]);
    return s;
  });
}
