import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { loadNewsMedia, newsMediaBytes, refreshTelegramMedia } from "@/lib/monitor/media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  const s = await readSession();
  if (!s || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null,{status:404});
  if (!(await one("select 1 from kz_memberships m join kz_users u on u.id=m.user_id where m.org_id=$1 and m.user_id=$2 and u.session_ver=$3",[s.org,s.uid,s.v??0]))) return new NextResponse(null,{status:404});
  const row = await loadNewsMedia(s.org,id);
  if (!row) return new NextResponse(null,{status:404});
  try {
    if (req.nextUrl.searchParams.get("manifest") === "1") {
      const media = row.media?.length ? row.media : await refreshTelegramMedia(s.org,row);
      return NextResponse.json({media},{headers:{"Cache-Control":"private, max-age=300","Vary":"Cookie"}});
    }
    const raw = req.nextUrl.searchParams.get("index") ?? "";
    if (!/^\d{1,2}$/.test(raw) || Number(raw)>9) return new NextResponse(null,{status:400});
    if (row.media?.length && !["image","video"].includes(row.media[Number(raw)]?.type)) return new NextResponse(null,{status:404});
    const result = await newsMediaBytes(s.org,row,Number(raw));
    const headers: Record<string,string> = {"Content-Type":result.mime,"Vary":"Cookie","Cache-Control":"private, max-age=86400","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Accept-Ranges":"bytes"};
    const range = req.headers.get("range");
    if (range) {
      const match = range.match(/^bytes=(\d+)-(\d*)$/);
      if (!match) return new NextResponse(null,{status:416,headers:{"Content-Range":`bytes */${result.data.length}`}});
      const start = Number(match[1]), end = Math.min(match[2] ? Number(match[2]) : result.data.length-1,result.data.length-1,start+2_000_000-1);
      if (start>end) return new NextResponse(null,{status:416,headers:{"Content-Range":`bytes */${result.data.length}`}});
      headers["Content-Range"]=`bytes ${start}-${end}/${result.data.length}`;
      headers["Content-Length"]=String(end-start+1);
      return new NextResponse(new Uint8Array(result.data.subarray(start,end+1)),{status:206,headers});
    }
    headers["Content-Length"]=String(result.data.length);
    if (result.mime.startsWith("video/")) {
      let offset = 0;
      return new NextResponse(new ReadableStream<Uint8Array>({pull(controller) {
        if (offset >= result.data.length) {controller.close();return;}
        const end = Math.min(offset+64_000,result.data.length);
        controller.enqueue(new Uint8Array(result.data.subarray(offset,end))); offset=end;
      }}),{headers});
    }
    return new NextResponse(new Uint8Array(result.data),{headers});
  } catch {return new NextResponse(null,{status:502,headers:{"Cache-Control":"no-store"}});}
}
