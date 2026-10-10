import { NextRequest, NextResponse } from "next/server";
import { resolveClick } from "@/lib/links";

export const dynamic = "force-dynamic";

/** Короткая ссылка из поста: считаем переход и ведём на сайт. Неизвестный код — на главную. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const to = await resolveClick(code, req.headers.get("user-agent") ?? "");
  if (!to) return NextResponse.redirect(new URL("/", req.url), 302);
  return new NextResponse(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}
