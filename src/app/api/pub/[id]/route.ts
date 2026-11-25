import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { one } from "@/lib/db";
import { checkPubSig } from "@/lib/pub-image";

export const dynamic = "force-dynamic";

/** Картинка для публикации по подписанной ссылке (подпись выдаётся только при отправке поста в канал). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !checkPubSig(id, req.nextUrl.searchParams.get("s") ?? "")) return new NextResponse("Not found", { status: 404 });
  const a = await one<{ data: Buffer; mime: string }>("select data,mime from kz_assets where id=$1", [id]);
  if (!a) return new NextResponse("Not found", { status: 404 });
  const jpeg = req.nextUrl.searchParams.get("format") === "jpeg";
  const data = jpeg ? await sharp(a.data).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer() : a.data;
  return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": jpeg ? "image/jpeg" : a.mime, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
