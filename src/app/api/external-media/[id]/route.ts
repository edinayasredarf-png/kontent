import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { readSession, validSession } from "@/lib/auth";
import { externalImages } from "@/lib/external-posts";
import { safeFetchBuffer } from "@/lib/safefetch";
export const dynamic = "force-dynamic";
export const maxDuration = 45;
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, index = req.nextUrl.searchParams.get("index") || "0";
  const missing = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^[0-9]$/.test(index)) return missing();
  const session = await readSession();
  if (!session || !await validSession(session)) return missing();
  try {
    const images = await externalImages(session.org, id);
    if (req.nextUrl.searchParams.get("meta") === "1") return NextResponse.json({count:images.length},{headers:{"Cache-Control":"private, no-store"}});
    const url = images[Number(index)];
    if (!url) return missing();
    const { data } = await safeFetchBuffer(url, 10_000_000);
    const image = await sharp(data, { limitInputPixels: 32_000_000 }).rotate().resize(1400,1400,{fit:"inside",withoutEnlargement:true}).webp({quality:82}).toBuffer();
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
  } catch { return missing(); }
}
