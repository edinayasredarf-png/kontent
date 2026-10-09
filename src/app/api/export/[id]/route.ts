import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { cleanHtml } from "@/lib/seo";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Готовая SEO-статья одним HTML-файлом: для сайтов без WordPress и webhook. Отдаётся как вложение, внутри — очищенная разметка. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await readSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const it = await one<{ body: string; meta: { seo?: { title: string; description: string; slug: string; keywords?: string[] } } }>(
    `select i.body,i.meta from kz_content_items i join kz_memberships m on m.org_id=i.org_id join kz_users u on u.id=m.user_id
      where i.id=$1 and i.kind='seo' and m.user_id=$2 and i.org_id=$3 and u.session_ver=$4`, [id, s.uid, s.org, s.v ?? 0]);
  const seo = it?.meta?.seo;
  if (!it || !seo) return new NextResponse("Not found", { status: 404 });
  const html = `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<title>${esc(seo.title)}</title>\n<meta name="description" content="${esc(seo.description)}">\n${seo.keywords?.length ? `<meta name="keywords" content="${esc(seo.keywords.join(", "))}">\n` : ""}</head>\n<body>\n<article>\n<h1>${esc(seo.title)}</h1>\n${cleanHtml(it.body)}\n</article>\n</body>\n</html>\n`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${seo.slug || "article"}.html"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
}
