import { NextRequest, NextResponse } from "next/server";
import { checkPubSig } from "@/lib/pub-image";

export const dynamic = "force-dynamic";

/** Страница-карточка с картинкой (Open Graph): ссылку на неё VK превращает в пост с крупным изображением, когда загрузить фото напрямую нельзя. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !checkPubSig(id, s)) return new NextResponse("Not found", { status: 404 });
  const img = `${req.nextUrl.origin}/api/pub/${id}?s=${s}`;
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Изображение</title><meta property="og:type" content="article"><meta property="og:title" content="Изображение"><meta property="og:image" content="${img}"><meta name="twitter:card" content="summary_large_image"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><img src="${img}" alt="" style="max-width:100%"></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
