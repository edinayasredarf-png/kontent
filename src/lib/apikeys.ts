import { createHash, randomBytes } from "node:crypto";
import { one, q } from "./db";

const hash = (k: string) => createHash("sha256").update(k).digest("hex");
export const RATE_PER_MINUTE = 60;

export interface ApiKeyRow { id: string; name: string; prefix: string; role: "viewer" | "editor"; revoked: boolean; last_used_at: string | null; created_at: string }

export const listKeys = (orgId: string) =>
  q<ApiKeyRow>("select id,name,prefix,role,revoked,last_used_at,created_at from kz_api_keys where org_id=$1 order by created_at desc", [orgId]);

/** Новый ключ. Показывается один раз: в базе только хеш. */
export async function createKey(orgId: string, userId: string, name: string, role: "viewer" | "editor"): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const nm = name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (nm.length < 2) return { ok: false, error: "Назовите ключ (минимум 2 символа), например «n8n»" };
  const n = await one<{ n: string }>("select count(*) n from kz_api_keys where org_id=$1 and not revoked", [orgId]);
  if (Number(n!.n) >= 10) return { ok: false, error: "Не больше 10 активных ключей — отзовите ненужные" };
  const key = `lt_${randomBytes(30).toString("base64url")}`;
  await q("insert into kz_api_keys(org_id,created_by,name,prefix,key_hash,role) values($1,$2,$3,$4,$5,$6)", [orgId, userId, nm, key.slice(0, 10), hash(key), role === "viewer" ? "viewer" : "editor"]);
  return { ok: true, key };
}

export const revokeKey = (orgId: string, id: string) => q("update kz_api_keys set revoked=true where id=$1 and org_id=$2", [id, orgId]);

export interface ApiAuth { orgId: string; keyId: string; role: "viewer" | "editor"; remaining: number }
export type AuthResult = { ok: true; auth: ApiAuth } | { ok: false; status: 401 | 429; error: string; retryAfter?: number };

/** Ключ из заголовка Authorization: Bearer … или X-API-Key. Лимит 60 запросов в минуту на ключ, счётчик в БД (функции Vercel не делят память). */
export async function authenticate(req: Request): Promise<AuthResult> {
  const h = req.headers.get("authorization") ?? "", raw = (/^Bearer\s+(.+)$/i.exec(h)?.[1] ?? req.headers.get("x-api-key") ?? "").trim();
  if (!/^lt_[A-Za-z0-9_-]{30,80}$/.test(raw)) return { ok: false, status: 401, error: "Нужен ключ API: заголовок Authorization: Bearer lt_…" };
  const r = await one<{ id: string; org_id: string; role: "viewer" | "editor"; cnt: number }>(
    `update kz_api_keys k set last_used_at=now(),
        window_count = case when k.window_start > now() - interval '1 minute' then k.window_count + 1 else 1 end,
        window_start = case when k.window_start > now() - interval '1 minute' then k.window_start else now() end
      from kz_orgs o
      where k.key_hash=$1 and not k.revoked and o.id=k.org_id and not o.suspended
      returning k.id,k.org_id,k.role,k.window_count as cnt`, [hash(raw)]);
  if (!r) return { ok: false, status: 401, error: "Ключ недействителен или отозван" };
  if (r.cnt > RATE_PER_MINUTE) return { ok: false, status: 429, error: `Слишком много запросов: не больше ${RATE_PER_MINUTE} в минуту`, retryAfter: 30 };
  return { ok: true, auth: { orgId: r.org_id, keyId: r.id, role: r.role, remaining: RATE_PER_MINUTE - r.cnt } };
}
