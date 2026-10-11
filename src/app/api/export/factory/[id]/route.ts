import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { csvOf, fileBase, markdownOf, plainOf, titleOf, type ExportItem } from "@/lib/exporter";
import { KINDS } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MAX_ITEMS = 300, ZIP_ITEMS = 120, ZIP_BYTES = 40 * 1024 * 1024;
const STATUSES = ["idea", "approved", "generating", "ready", "scheduled", "published", "failed", "rejected"];

/**
 * Выгрузка материалов завода по фильтру: ?format=csv|zip&kind=&status=&from=ГГГГ-ММ-ДД&to=ГГГГ-ММ-ДД.
 * CSV открывается в Excel (UTF-8 с BOM, разделитель «;»). ZIP — папка на материал: текст .txt и .md и его картинки (до 120 материалов и 40 МБ).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await readSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  if (!(await q("select 1 from kz_factories f join kz_memberships m on m.org_id=f.org_id join kz_users u on u.id=m.user_id where f.id=$1 and f.org_id=$2 and m.user_id=$3 and u.session_ver=$4 and not u.disabled", [id, s.org, s.uid, s.v ?? 0])).length) return new NextResponse("Not found", { status: 404 });
  const u = req.nextUrl.searchParams, fmt = u.get("format") === "zip" ? "zip" : "csv";
  const args: unknown[] = [id, s.org], cond: string[] = [];
  const kind = u.get("kind"), status = u.get("status"), from = u.get("from"), to = u.get("to");
  if (kind && (KINDS as readonly string[]).includes(kind)) { args.push(kind); cond.push(`i.kind=$${args.length}`); }
  if (status && STATUSES.includes(status)) { args.push(status); cond.push(`i.status=$${args.length}`); }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { args.push(from); cond.push(`i.planned_for >= $${args.length}::date`); }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { args.push(to); cond.push(`i.planned_for <= $${args.length}::date`); }
  const rows = await q<{ id: string; kind: string; topic: string; hook: string; body: string; status: string; planned_for: string | null; image_id: string | null; meta: Record<string, any>; urls: string | null }>(
    `select i.id,i.kind,i.topic,i.hook,i.body,i.status,to_char(i.planned_for,'YYYY-MM-DD') planned_for,i.image_id,i.meta,
            (select string_agg(p.external_url, ' ') from kz_publications p where p.item_id=i.id and p.status='published' and p.external_url is not null) urls
       from kz_content_items i where i.factory_id=$1 and i.org_id=$2 ${cond.map((c) => "and " + c).join(" ")} order by i.planned_for nulls last, i.created_at limit ${MAX_ITEMS}`, args);
  const toItem = (r: (typeof rows)[0]): ExportItem => ({ kind: r.kind, topic: r.topic, hook: r.hook, body: r.body, status: r.status, planned_for: r.planned_for, seo: r.meta.seo ?? null, email: r.meta.email ?? null, guide: r.meta.guide ?? null, carousel: r.meta.carousel ?? null, infographic: r.meta.infographic ?? null, poll: r.meta.poll ?? null });
  const head = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const stamp = new Date().toISOString().slice(0, 10);
  if (fmt === "csv") {
    const csv = csvOf([["Дата", "Формат", "Статус", "Тема", "Заголовок", "Хук", "Текст", "Ссылки на публикации"], ...rows.map((r) => { const it = toItem(r); return [r.planned_for ?? "", r.kind, r.status, r.topic, titleOf(it), r.hook, plainOf(it), r.urls ?? ""]; })]);
    return new NextResponse(csv, { headers: { ...head, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="materials-${stamp}.csv"` } });
  }
  const zip = new JSZip();
  let bytes = 0, n = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    if (n >= ZIP_ITEMS) { skipped.push(`${r.planned_for ?? ""} ${r.topic}`); continue; }
    const it = toItem(r), dir = `${r.planned_for ?? "bez-daty"}_${r.kind}_${fileBase(it).slice(0, 40)}_${r.id.slice(0, 4)}`;
    const imgs = await q<{ position: number; data: Buffer }>("select position,data from kz_assets where item_id=$1 and org_id=$2 and position>=0 order by position", [r.id, s.org]);
    const single = !imgs.length && r.image_id ? await q<{ data: Buffer }>("select data from kz_assets where id=$1 and org_id=$2", [r.image_id, s.org]) : [];
    const size = imgs.reduce((a, x) => a + x.data.length, 0) + single.reduce((a, x) => a + x.data.length, 0);
    if (bytes + size > ZIP_BYTES) { skipped.push(`${r.planned_for ?? ""} ${r.topic}`); continue; }
    bytes += size; n++;
    zip.file(`${dir}/text.txt`, "﻿" + plainOf(it) + "\n"); zip.file(`${dir}/text.md`, "﻿" + markdownOf(it));
    imgs.forEach((a, i) => zip.file(`${dir}/${r.kind === "carousel" ? `slide-${String(i + 1).padStart(2, "0")}` : `image-${i + 1}`}.jpg`, a.data));
    single.forEach((a) => zip.file(`${dir}/image.jpg`, a.data));
  }
  if (skipped.length) zip.file("НЕ_ВОШЛИ.txt", `В архив помещается до ${ZIP_ITEMS} материалов и ${ZIP_BYTES / 1048576} МБ. Не вошли (${skipped.length}):\n${skipped.join("\n")}\nСузьте фильтр (период, формат, статус) и выгрузите снова.\n`);
  if (!n) return new NextResponse("По фильтру нет материалов", { status: 404 });
  return new NextResponse(await zip.generateAsync({ type: "uint8array", compression: "STORE" }) as BodyInit, { headers: { ...head, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="materials-${stamp}.zip"` } });
}
