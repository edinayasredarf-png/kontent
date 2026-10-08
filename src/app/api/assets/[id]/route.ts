import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { loadAsset } from "@/lib/assets";

export const dynamic = "force-dynamic";

/** Отдаёт картинку только участнику той организации, которой она принадлежит. Чужой id неотличим от несуществующего. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await readSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  if (!(await one("select 1 from kz_memberships where org_id=$1 and user_id=$2", [s.org, s.uid]))) return new NextResponse("Not found", { status: 404 });
  const a = await loadAsset(s.org, id);
  if (!a) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(a.data), {
    headers: { "Content-Type": a.mime, "Content-Length": String(a.data.length), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
