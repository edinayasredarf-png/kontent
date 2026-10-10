import { NextRequest, NextResponse } from "next/server";
import { loadAsset } from "@/lib/assets";
import { portalAsset, portalByToken } from "@/lib/share";

export const dynamic = "force-dynamic";

/** Картинки клиентского портала: слайды и изображения материалов бренда, к которому выдана ссылка. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const p = await portalByToken(token);
  if (!p || !(await portalAsset(p, id))) return new NextResponse("Not found", { status: 404 });
  const a = await loadAsset(p.link.org_id, id);
  if (!a) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(a.data), { headers: { "Content-Type": a.mime, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "X-Robots-Tag": "noindex" } });
}
