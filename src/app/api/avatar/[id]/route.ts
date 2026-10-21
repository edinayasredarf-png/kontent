import { NextRequest, NextResponse } from "next/server";
import { readSession, validSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { loadAvatar } from "@/lib/avatar";

export const dynamic = "force-dynamic";

/** Аватарку отдаём самому пользователю и тем, с кем он в одной организации. Чужой и несуществующий id неотличимы (404). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await readSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(id) || !(await validSession(s))) return new NextResponse("Not found", { status: 404 });
  const allowed = id === s.uid || !!(await one("select 1 from kz_memberships a join kz_memberships b on b.org_id=a.org_id where a.user_id=$1 and b.user_id=$2", [s.uid, id]));
  const a = allowed ? await loadAvatar(id) : null;
  if (!a) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(a.data), { headers: { "Content-Type": a.mime, "Content-Length": String(a.data.length), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
}
