import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { cleanKit } from "@/lib/images";
import { pdfOf } from "@/lib/pdf";
import { docxOf, fileBase, isHtmlKind, markdownOf, plainOf, type ExportItem } from "@/lib/exporter";
import { emailHtml, guideHtml } from "@/lib/docs";
import { cleanHtml } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const send = (data: BodyInit, type: string, name: string) => new NextResponse(data, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });

/** Скачать материал: ?format=txt | md | docx | pdf | html | zip. ZIP — текст (txt, md) и картинки материала. Только участникам организации. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await readSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const row = await one<{ kind: string; topic: string; hook: string; body: string; status: string; planned_for: string | null; image_id: string | null; meta: Record<string, any>; brand: string; kit: unknown }>(
    `select i.kind,i.topic,i.hook,i.body,i.status,to_char(i.planned_for,'YYYY-MM-DD') planned_for,i.image_id,i.meta,b.name brand,b.kit
       from kz_content_items i join kz_brands b on b.id=i.brand_id join kz_memberships m on m.org_id=i.org_id join kz_users u on u.id=m.user_id
      where i.id=$1 and m.user_id=$2 and i.org_id=$3 and u.session_ver=$4 and not u.disabled`, [id, s.uid, s.org, s.v ?? 0]);
  if (!row) return new NextResponse("Not found", { status: 404 });
  const it: ExportItem = { kind: row.kind, topic: row.topic, hook: row.hook, body: row.body, status: row.status, planned_for: row.planned_for, seo: row.meta.seo ?? null, email: row.meta.email ?? null, guide: row.meta.guide ?? null, carousel: row.meta.carousel ?? null, infographic: row.meta.infographic ?? null, poll: row.meta.poll ?? null };
  const base = fileBase(it), fmt = req.nextUrl.searchParams.get("format") ?? "txt";
  if (fmt === "txt") return send("﻿" + plainOf(it) + "\n", "text/plain; charset=utf-8", `${base}.txt`);
  if (fmt === "md") return send("﻿" + markdownOf(it), "text/markdown; charset=utf-8", `${base}.md`);
  if (fmt === "docx") return send(await docxOf(it) as BodyInit, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `${base}.docx`);
  if (fmt === "pdf") {
    const brand = { name: row.brand, color: cleanKit(row.kit).colors?.[0]?.hex ?? "#029cda" };
    try { return send(await pdfOf(it, brand) as BodyInit, "application/pdf", `${base}.pdf`); }
    catch (e) { return new NextResponse(`Не удалось собрать PDF: ${(e as Error).message}`, { status: 500 }); }
  }
  if (fmt === "html") {
    const brand = { name: row.brand, color: cleanKit(row.kit).colors?.[0]?.hex ?? "#029cda" };
    let html: string | null = null;
    if (row.kind === "email" && it.email) html = emailHtml(row.meta.email, row.body, brand);
    else if (row.kind === "guide" && it.guide) html = guideHtml(row.meta.guide, row.body, brand);
    else if (row.kind === "seo" && it.seo) html = `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><title>${esc(it.seo.title)}</title></head><body><article><h1>${esc(it.seo.title)}</h1>\n${cleanHtml(row.body)}</article></body></html>`;
    if (!html) return new NextResponse("HTML доступен для SEO-статей, рассылок и гайдов", { status: 400 });
    return send(html, "text/html; charset=utf-8", `${base}.html`);
  }
  if (fmt === "zip") {
    const zip = new JSZip();
    zip.file(`${base}.txt`, "﻿" + plainOf(it) + "\n"); zip.file(`${base}.md`, "﻿" + markdownOf(it));
    const slides = await q<{ position: number; data: Buffer; mime: string }>("select position,data,mime from kz_assets where item_id=$1 and org_id=$2 and position>=0 order by position", [id, s.org]);
    slides.forEach((a, i) => zip.file(row.kind === "carousel" ? `slide-${String(i + 1).padStart(2, "0")}.jpg` : `image-${i + 1}.jpg`, a.data));
    if (!slides.length && row.image_id) { const img = await one<{ data: Buffer }>("select data from kz_assets where id=$1 and org_id=$2", [row.image_id, s.org]); if (img) zip.file("image.jpg", img.data); }
    return send(await zip.generateAsync({ type: "uint8array", compression: "STORE" }) as BodyInit, "application/zip", `${base}.zip`);
  }
  return new NextResponse("Формат: txt, md, docx, pdf, html или zip", { status: 400 });
}
