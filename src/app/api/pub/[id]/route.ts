import { NextRequest, NextResponse } from "next/server";
import { one } from "@/lib/db";
import { checkPubSig, ogCard } from "@/lib/pub-image";

export const dynamic = "force-dynamic";

/** Картинка для публикации по подписанной ссылке (подпись выдаётся только при отправке поста в канал). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !checkPubSig(id, req.nextUrl.searchParams.get("s") ?? "")) return new NextResponse("Not found", { status: 404 });
  const a = await one<{ data: Buffer; mime: string }>("select data,mime from kz_assets where id=$1", [id]);
  if (!a) return new NextResponse("Not found", { status: 404 });
  if (req.nextUrl.searchParams.get("og")) {
    const og = await ogCard(a.data).catch(() => null);
    if (og) return new NextResponse(new Uint8Array(og), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  }
  return new NextResponse(new Uint8Array(a.data), { headers: { "Content-Type": a.mime, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
