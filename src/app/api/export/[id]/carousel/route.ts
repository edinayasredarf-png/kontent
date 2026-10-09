import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { one, q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Скачать карусель архивом: слайды по порядку и подпись текстом. Для ручной публикации там, куда мы не публикуем сами. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await readSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const it = await one<{ body: string }>(
    `select i.body from kz_content_items i join kz_memberships m on m.org_id=i.org_id join kz_users u on u.id=m.user_id
      where i.id=$1 and i.kind='carousel' and m.user_id=$2 and i.org_id=$3 and u.session_ver=$4 and not u.disabled`, [id, s.uid, s.org, s.v ?? 0]);
  if (!it) return new NextResponse("Not found", { status: 404 });
  const rows = await q<{ position: number; data: Buffer }>("select position,data from kz_assets where item_id=$1 and org_id=$2 and position>=0 order by position", [id, s.org]);
  if (!rows.length) return new NextResponse("Not found", { status: 404 });
  const zip = new JSZip();
  rows.forEach((r, i) => zip.file(`slide-${String(i + 1).padStart(2, "0")}.jpg`, r.data));
  if (it.body) zip.file("caption.txt", it.body);
  const buf = await zip.generateAsync({ type: "uint8array", compression: "STORE" }); // JPEG уже сжаты — упаковка без сжатия быстрее
  return new NextResponse(buf as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="carousel-${id.slice(0, 8)}.zip"`, "Cache-Control": "private, no-store" } });
}
