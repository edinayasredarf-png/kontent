import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { cleanKit } from "@/lib/images";
import { emailHtml, guideHtml, type EmailMeta, type GuideMeta } from "@/lib/docs";

export const dynamic = "force-dynamic";

/** Рассылка (?as=file — скачать HTML, иначе просмотр) и гайд (страница для печати и PDF). Только участникам организации. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await readSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const it = await one<{ kind: string; body: string; meta: { email?: EmailMeta; guide?: GuideMeta }; brand: string; kit: unknown }>(
    `select i.kind,i.body,i.meta,b.name brand,b.kit from kz_content_items i join kz_brands b on b.id=i.brand_id join kz_memberships m on m.org_id=i.org_id join kz_users u on u.id=m.user_id
      where i.id=$1 and i.kind in ('email','guide') and m.user_id=$2 and i.org_id=$3 and u.session_ver=$4`, [id, s.uid, s.org, s.v ?? 0]);
  if (!it) return new NextResponse("Not found", { status: 404 });
  const brand = { name: it.brand, color: cleanKit(it.kit).colors?.[0]?.hex ?? "#029cda" };
  const html = it.kind === "email" && it.meta.email ? emailHtml(it.meta.email, it.body, brand) : it.kind === "guide" && it.meta.guide ? guideHtml(it.meta.guide, it.body, brand) : null;
  if (!html) return new NextResponse("Not found", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; script-src 'unsafe-inline'; base-uri 'none'" };
  if (req.nextUrl.searchParams.get("as") === "file") headers["Content-Disposition"] = `attachment; filename="${it.kind === "email" ? "email" : "guide"}.html"`;
  return new NextResponse(html, { headers });
}
