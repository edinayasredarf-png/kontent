import { NextResponse } from "next/server";
import { authenticate, type ApiAuth } from "./apikeys";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });

export const apiError = (status: number, error: string, extra: Record<string, string> = {}) => json({ error }, status, extra);
export const apiOk = (body: unknown, status = 200, extra: Record<string, string> = {}) => json(body, status, extra);

type Handler = (auth: ApiAuth, req: Request) => Promise<NextResponse>;

/** Общая обёртка: проверка ключа, роли (viewer не пишет), заголовки лимита, единый формат ошибок. */
export function withApi(write: boolean, fn: Handler) {
  return async (req: Request): Promise<NextResponse> => {
    const a = await authenticate(req);
    if (!a.ok) return apiError(a.status, a.error, a.retryAfter ? { "Retry-After": String(a.retryAfter) } : {});
    if (write && a.auth.role !== "editor") return apiError(403, "Этот ключ только для чтения. Создайте ключ с правом записи.");
    try { return await fn(a.auth, req); }
    catch (e) { console.error("[api/v1]", e); return apiError(500, "Внутренняя ошибка. Попробуйте позже."); }
  };
}

/** Тело запроса как объект; мусор и не-JSON — пустой объект с пометкой. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try { const j = await req.json(); return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null; } catch { return null; }
}
export const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
