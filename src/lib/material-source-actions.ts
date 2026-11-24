"use server";
import {requireWriter} from "./auth";
import {one,q} from "./db";
import {revalidatePath} from "next/cache";
import {snapshotSource,type MaterialSource} from "./source-context";
export async function saveMaterialSourceAction(_:unknown,f:FormData):Promise<{ok?:string;error?:string}> {
 const c=await requireWriter(),id=String(f.get("item")??"");
 const row=await one<{source:MaterialSource}>("select meta->'source' source from kz_content_items where id::text=$1 and org_id=$2 and status<>'generating'",[id,c.org.id]);
 if(!row?.source)return {error:"Контекст недоступен или материал уже создаётся"};
 const old=row.source;
 const docs=old.documents?.length?old.documents:[{title:old.title,url:old.url,body:old.body,media:old.media??[],status:"full" as const}];
 let size=0;
 for(let i=0;i<docs.length;i++){const value=f.get(`source_${i}`);if(typeof value==='string'){size+=value.length;if(value.length>500000||size>1500000)return {error:"Исходные материалы слишком большие"};docs[i]={...docs[i],body:value.trim(),status:value.trim()?"full":"excerpt"};}}
 const source=snapshotSource(docs,String(f.get("instructions")??"").slice(0,12000),{name:old.name,newsId:old.newsId,trendRun:old.trendRun});
 await q("update kz_content_items set meta=jsonb_set(meta,'{source}',$3::jsonb),updated_at=now() where id::text=$1 and org_id=$2 and status<>'generating'",[id,c.org.id,JSON.stringify(source)]);
 revalidatePath("/app","layout");return {ok:"Контекст сохранён. Он будет учтён при генерации и доработке."};
}
