import { NextResponse } from "next/server";
import { applyPayment } from "@/lib/payments";
import { yooConfig, yooRequest, type YooPayment } from "@/lib/yookassa";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 16384) return new NextResponse(null, { status: 413 });
  let body: { event?: string; object?: { id?: string } };
  try { const raw = await request.text(); if (raw.length > 16384) return new NextResponse(null, { status: 413 }); body = JSON.parse(raw); } catch { return new NextResponse(null, { status: 400 }); }
  if (!body || typeof body !== "object") return new NextResponse(null, { status: 400 });
  if (!["payment.succeeded", "payment.canceled", "payment.waiting_for_capture"].includes(body.event || "")) return NextResponse.json({ ok: true });
  if (!body.object?.id || !/^[0-9a-f-]{36}$/i.test(body.object.id)) return new NextResponse(null, { status: 400 });
  try {
    const config = await yooConfig();
    const payment = await yooRequest<YooPayment>(config, `payments/${encodeURIComponent(body.object.id)}`);
    await applyPayment(payment);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
