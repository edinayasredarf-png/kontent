import {q} from "./db";
import {readSourceDocument} from "./material-source";
import {snapshotSource,type MaterialSource,type SourceDocument} from "./source-context";
import {ARTICLE_STATUS} from "./monitor/article-state";
import type {TrendReport} from "./trends-data";
import {type PlanBase} from "./plan-bases";
export interface PlanEvidence {id:string;type:"news"|"trends";source:MaterialSource}
async function batches<T,R>(rows:T[],fn:(row:T)=>Promise<R>):Promise<R[]>{const out:R[]=[];for(let i=0;i<rows.length;i+=4)out.push(...await Promise.all(rows.slice(i,i+4).map(fn)));return out;}
/** Organization and brand boundaries apply both to news and cached trend reports. */
export async function loadPlanEvidence(orgId:string,factoryId:string,brandId:string,bases:PlanBase[]):Promise<PlanEvidence[]> {
 const evidence:PlanEvidence[]=[];
 if(bases.includes("news")){
  const rows=await q<{id:string;title:string;url:string;body:string;full_text:string|null;full_status:string;media:SourceDocument['media'];kind:string}>(`select i.id,i.title,i.url,i.body,i.full_text,i.full_status,i.media,s.kind from kz_feed_items i join kz_sources s on s.id=i.source_id and s.org_id=i.org_id
   where i.org_id=$1 and not i.excluded and i.status<>'dismissed' and i.published_at>now()-interval '30 days'
   and (s.config->'brandIds' ? $2 or coalesce(s.config->'brandIds','[]'::jsonb)='[]'::jsonb) order by i.published_at desc limit 8`,[orgId,brandId]);
  evidence.push(...await batches(rows,async row=>{
   const doc:SourceDocument=row.full_status===ARTICLE_STATUS&&row.full_text?{title:row.title,url:row.url,body:row.full_text,media:row.media,status:"full"}:!["news","site"].includes(row.kind)?{title:row.title,url:row.url,body:row.body,media:row.media,status:"full"}:await readSourceDocument(row);
   return {id:`news:${row.id}`,type:"news" as const,source:snapshotSource([doc],"Использовать новость как инфоповод, связать с брифом компании; не выдумывать детали.",{newsId:row.id,name:"Новости"})};
  }));
 }
 if(bases.includes("trends")){
  const runs=await q<{id:string;result:TrendReport}>("select id,result from kz_trend_runs where org_id=$1 and factory_id=$2 and created_at>now()-interval '30 days' order by created_at desc limit 2",[orgId,factoryId]);
  for(const run of runs){
   const rows=run.result.ideas.slice(0,4);
   evidence.push(...await batches(rows,async idea=>{
    const selected=run.result.sources.filter(s=>idea.sources.includes(s.id));
    const docs=await batches(selected,async s=>s.text?{title:s.title,url:s.url,body:s.text,media:s.media??[],status:"full" as const}:readSourceDocument({...s,body:s.summary}));
    return {id:`trend:${run.id}:${idea.id}`,type:"trends" as const,source:snapshotSource(docs,`Идея: ${idea.title}\nХук: ${idea.hook}\nПодача: ${idea.angle}\nСвязь с брендом: ${idea.fit}`,{trendRun:run.id,name:"Тренды"})};
   }));
  }
 }
 return evidence.filter(e=>e.source.documents?.some(d=>d.body.trim().length>=120));
}
export function evidenceSource(ids:string[],entries:PlanEvidence[]):MaterialSource|undefined {
 const selected=entries.filter(e=>ids.includes(e.id));
 if(!selected.length)return undefined;
 return snapshotSource(selected.flatMap(e=>e.source.documents??[]),selected.map(e=>e.source.instructions??"").join("\n"),{...(selected.length===1?{newsId:selected[0].source.newsId,trendRun:selected[0].source.trendRun}:{}),name:selected.map(e=>e.type==="news"?"Новости":"Тренды").filter((x,i,a)=>a.indexOf(x)===i).join(" + ")});
}
