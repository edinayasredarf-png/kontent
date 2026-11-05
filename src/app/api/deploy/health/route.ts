import { NextResponse } from "next/server";
import { one } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (!process.env.AUTH_SECRET || !process.env.CRON_SECRET) throw new Error("Missing runtime config");
    await one("select 1 from kz_users limit 1");
    return NextResponse.json({ ok: true, revision: process.env.RELEASE_SHA || "unknown" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
