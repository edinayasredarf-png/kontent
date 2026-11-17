import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { readSession, validSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { safeFetchBuffer, safeFetchText } from "@/lib/safefetch";
import { parseTelegram } from "@/lib/monitor/parse";
import { telegramPostPath } from "@/lib/monitor/telegram-widget";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ext = req.nextUrl.searchParams.get("post") ?? "";
  const index = req.nextUrl.searchParams.get("index") ?? "";
  const missing = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!/^[\da-f-]{36}$/i.test(id) || !ext || ext.length > 2500 || !/^[0-5]$/.test(index)) return missing();
  const session = await readSession();
  if (!session || !(await validSession(session))) return missing();
  const row = await one<{ image: string | null; url: string; kind: string }>(
    "select p.images[$4] image,p.url,c.kind from kz_competitor_posts p join kz_competitors c on c.id=p.competitor_id where c.id=$1 and c.org_id=$2 and p.ext_id=$3",
    [id, session.org, ext, Number(index) + 1],
  );
  if (!row?.image) return missing();
  const download = async (url: string) => {
    const { data } = await safeFetchBuffer(url, 10_000_000);
    return sharp(data, { limitInputPixels: 32_000_000 }).rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  };
  try {
    let data;
    try { data = await download(row.image); }
    catch (error) {
      const path = row.kind === "telegram" && telegramPostPath(row.url);
      if (!path) throw error;
      const page = await safeFetchText(`https://t.me/s/${path}`, { maxBytes: 2_000_000 });
      const media = parseTelegram(page.text, path.split("/")[0]).find(post => telegramPostPath(post.url) === path)?.media;
      const url = media?.filter(m => m.type === "image" && m.url)[Number(index)]?.url;
      if (!url) return missing();
      data = await download(url);
    }
    return new NextResponse(new Uint8Array(data), { headers: {
      "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
    } });
  } catch {
    return missing();
  }
}
