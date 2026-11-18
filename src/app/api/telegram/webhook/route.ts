import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handleTelegramConnect } from "@/lib/telegram-connect";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(req: Request) {
  const expected = Buffer.from(process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || ""), actual = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") || "");
  if (!expected.length || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return new NextResponse("Forbidden", { status: 403 });
  try { await handleTelegramConnect(await req.json()); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
