import { NextRequest, NextResponse } from "next/server";
import { readSession, validSession } from "@/lib/auth";
import { enrichVisibleItems } from "@/lib/monitor/news";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_URL || req.nextUrl.origin;
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).origin === new URL(expected).origin; } catch { /* Некорректный Origin. */ }
  if (!sameOrigin) return new NextResponse(null, { status: 403 });
  const session = await readSession();
  if (!session || !(await validSession(session))) return new NextResponse(null, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.ids)) return new NextResponse(null, { status: 400 });
  const items = await enrichVisibleItems(session.org, body.ids.filter((id: unknown): id is string => typeof id === "string").slice(0, 3));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
