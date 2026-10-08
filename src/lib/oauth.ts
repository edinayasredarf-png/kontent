import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { one, tx } from "./db";
import { createAccount, defaultOrg, type Session } from "./auth";

export type Provider = "yandex" | "vk";
export const PROVIDERS: Provider[] = ["yandex", "vk"];
export const PROVIDER_NAME: Record<Provider, string> = { yandex: "Яндекс", vk: "VK" };

/** Имена переменных те же, что на единойсреде (NEXT_PUBLIC_*_CLIENT_ID, *_CLIENT_SECRET) — можно скопировать как есть. */
export function creds(p: Provider): { id: string; secret: string } | null {
  const E = process.env;
  const id = (p === "yandex" ? E.YANDEX_CLIENT_ID || E.NEXT_PUBLIC_YANDEX_CLIENT_ID : E.VK_CLIENT_ID || E.NEXT_PUBLIC_VK_CLIENT_ID)?.trim();
  const secret = (p === "yandex" ? E.YANDEX_CLIENT_SECRET : E.VK_CLIENT_SECRET)?.trim();
  return id && secret ? { id, secret } : null;
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

export function authorizeUrl(req: Request, p: Provider, state: string): string {
  const c = creds(p)!;
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri(req, p), response_type: "code", state });
  if (p === "yandex") { q.set("scope", "login:email login:info"); return `https://oauth.yandex.ru/authorize?${q}`; }
  q.set("scope", "email"); q.set("display", "page"); q.set("v", "5.131");
  return `https://oauth.vk.com/authorize?${q}`;
}

export interface Profile { id: string; email: string | null; name: string }

async function json(res: Response, what: string) {
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j as { error?: unknown }).error) throw new Error(`${what}: ${res.status} ${JSON.stringify((j as { error_description?: string; error?: unknown }).error_description ?? (j as { error?: unknown }).error ?? "").slice(0, 120)}`);
  return j as Record<string, unknown>;
}

/** Обмен кода на токен и профиль. Все запросы — с сервера, секрет приложения в браузер не попадает. */
export async function fetchProfile(req: Request, p: Provider, code: string): Promise<Profile> {
  const c = creds(p)!;
  const t = AbortSignal.timeout(15_000);
  if (p === "yandex") {
    const tok = await json(await fetch("https://oauth.yandex.ru/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: t,
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: c.id, client_secret: c.secret }),
    }), "Яндекс token");
    const me = await json(await fetch("https://login.yandex.ru/info?format=json", { headers: { Authorization: `OAuth ${tok.access_token}` }, signal: t }), "Яндекс info");
    const email = String(me.default_email ?? (me.emails as string[] | undefined)?.[0] ?? "").toLowerCase();
    return { id: String(me.id), email: email || null, name: String(me.real_name ?? me.display_name ?? `${me.first_name ?? ""} ${me.last_name ?? ""}`).trim() };
  }
  const q = new URLSearchParams({ client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(req, p), code });
  const tok = await json(await fetch(`https://oauth.vk.com/access_token?${q}`, { signal: t }), "VK token");
  const uid = String(tok.user_id ?? "");
  if (!uid) throw new Error("VK не вернул user_id");
  let name = "";
  try {
    const u = await json(await fetch(`https://api.vk.com/method/users.get?${new URLSearchParams({ access_token: String(tok.access_token), v: "5.131", fields: "first_name,last_name" })}`, { signal: t }), "VK users.get");
    const r = (u.response as { first_name?: string; last_name?: string }[] | undefined)?.[0];
    name = `${r?.first_name ?? ""} ${r?.last_name ?? ""}`.trim();
  } catch { /* имя необязательно */ }
  return { id: uid, email: tok.email ? String(tok.email).toLowerCase() : null, name };
}

/**
 * Кто этот человек у нас: 1) уже входил этим аккаунтом; 2) есть пользователь с тем же email — привязываем (провайдер
 * подтверждает email); 3) новый — создаём пользователя и организацию. Без email (VK мог не отдать) заводим служебный адрес.
 */
export async function resolveUser(p: Provider, prof: Profile): Promise<Session> {
  const known = await one<{ user_id: string }>("select user_id from kz_oauth_identities where provider=$1 and provider_id=$2", [p, prof.id]);
  if (known) {
    const org = await defaultOrg(known.user_id);
    if (!org) throw new Error("У пользователя нет организации");
    return { uid: known.user_id, org };
  }
  const email = prof.email ?? `${p}-${prof.id}@oauth.invalid`;
  return tx(async (run) => {
    const [ex] = await run<{ id: string }>("select id from kz_users where email=$1", [email]);
    let s: Session;
    if (ex) {
      const org = await defaultOrg(ex.id);
      if (!org) throw new Error("У пользователя нет организации");
      s = { uid: ex.id, org };
    } else {
      // пароль случайный и никому не известен: войти по паролю в такой аккаунт нельзя, только через провайдера
      s = await createAccount(run, email, prof.name, await bcrypt.hash(randomBytes(24).toString("hex"), 8), prof.name ? `Организация ${prof.name}` : "Моя организация");
    }
    await run("insert into kz_oauth_identities(provider,provider_id,user_id) values($1,$2,$3) on conflict do nothing", [p, prof.id, s.uid]);
    return s;
  });
}
