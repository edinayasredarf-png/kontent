import {NextRequest,NextResponse} from "next/server";
import {readSession,validSession} from "@/lib/auth";
import {one} from "@/lib/db";
import {sourceMedia,type MaterialSource} from "@/lib/source-context";
import {safeFetchBuffer} from "@/lib/safefetch";
import {loadAsset} from "@/lib/assets";
import sharp from "sharp";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params,index=Number(req.nextUrl.searchParams.get('index')??0);
 const missing=()=>new NextResponse(null,{status:404,headers:{'Cache-Control':'no-store'}});
 const session=await readSession();
 if(!/^[a-f0-9-]{36}$/i.test(id)||!Number.isInteger(index)||index<0||index>100||!session||!await validSession(session))return missing();
 const row=await one<{source:MaterialSource}>("select meta->'source' source from kz_content_items where id=$1 and org_id=$2",[id,session.org]);
 const media=sourceMedia(row?.source)[index];if(media?.type!=='image'||!media.url)return missing();
 try{const data=media.assetId?(await loadAsset(session.org,media.assetId))?.data:(await safeFetchBuffer(media.url,10000000)).data;if(!data)return missing();const image=await sharp(data,{limitInputPixels:32000000}).rotate().resize(1400,1400,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();return new NextResponse(new Uint8Array(image),{headers:{'Content-Type':'image/webp','Cache-Control':'private, max-age=3600',Vary:'Cookie','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}});}catch{return missing();}
}
