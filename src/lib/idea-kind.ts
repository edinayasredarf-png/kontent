import {q} from "./db";
import {KINDS} from "./plan";
export async function changeIdeaKind(orgId:string,id:string,kind:string,version:string) {
 if(!(KINDS as readonly string[]).includes(kind))return {ok:false as const,error:"Выберите тип материала"};
 if(!Number.isFinite(Date.parse(version)))return {ok:false as const,error:"Обновите идею перед изменением"};
 const rows=await q(`update kz_content_items set kind=$3,meta=case when kind<>$3 then meta-'carousel'-'poll'-'seo'-'variants' else meta end,updated_at=now()
 where org_id=$1 and id::text=$2 and status='idea' and updated_at=$4::timestamptz returning id`,[orgId,id,kind,version]);
 return rows.length?{ok:true as const}:{ok:false as const,error:"Идея изменилась или уже создаётся. Обновите страницу."};
}
