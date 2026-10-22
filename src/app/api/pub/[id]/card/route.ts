import { NextRequest, NextResponse } from "next/server";
import { one } from "@/lib/db";
import { checkPubSig } from "@/lib/pub-image";

export const dynamic = "force-dynamic";

/** Страница-карточка с картинкой (Open Graph): ссылку на неё VK превращает в пост с крупным изображением, когда загрузить фото напрямую нельзя. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !checkPubSig(id, s)) return new NextResponse("Not found", { status: 404 });
  const a = await one<{ width: number; height: number; mime: string }>("select width,height,mime from kz_assets where id=$1", [id]).catch(() => null);
  const img = `${req.nextUrl.origin}/api/pub/${id}?s=${s}`;
  const self = `${req.nextUrl.origin}/api/pub/${id}/card?s=${s}`;
  // размеры и тип в метках нужны парсеру VK: без них он нередко отвечает «No photo given»
  const meta = [
    ["og:type", "article"], ["og:title", "Изображение"], ["og:description", "Изображение к публикации"], ["og:url", self], ["og:image", img], ["og:image:secure_url", img],
    ...(a ? [["og:image:type", a.mime], ["og:image:width", String(a.width)], ["og:image:height", String(a.height)]] : []),
  ].map(([k, v]) => `<meta property="${k}" content="${v}">`).join("");
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Изображение</title>${meta}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${img}"><link rel="image_src" href="${img}"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><img src="${img}" alt="" style="max-width:100%"></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
