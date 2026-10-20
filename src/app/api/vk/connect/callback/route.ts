import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readSession, loadWriterOrNull } from "@/lib/auth";
import { finishConnect } from "@/lib/vk-connect";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: NextRequest) {
  const done = (e: string) => { const r = NextResponse.redirect(new URL(`/app/channels?vk=${e}`, req.url)); r.cookies.delete({ name: "lt_vk_connect", path: "/api/vk/connect" }); return r; };
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return done("denied");
  const s = await readSession();
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  if (!(await loadWriterOrNull(s))) return done("forbidden");
  const code = sp.get("code") ?? "", state = sp.get("state") ?? "", deviceId = sp.get("device_id") ?? "";
  const [st = "", verifier = "", uid = "", org = ""] = (req.cookies.get("lt_vk_connect")?.value ?? "").split(".");
  // state совпал, а запрос начат этим же пользователем в этой же организации: чужой код или чужая сессия подключение не создадут
  if (!code || !state || !same(st, state) || uid !== s.uid || org !== s.org) return done("state");
  if (!deviceId) return done("failed");
  try {
    await finishConnect(req, { orgId: s.org, userId: s.uid, code, verifier, deviceId, state });
    return done("ok");
  } catch (e) {
    console.error("[vk-connect]", (e as Error).message); // без кода и токенов
    return done("failed");
  }
}
