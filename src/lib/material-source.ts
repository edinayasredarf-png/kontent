import {one,q} from "./db";
import {ARTICLE_STATUS} from "./monitor/article-state";
import {safeFetchText,safeFetchBuffer} from "./safefetch";
import {extractArticle} from "./article";
import {resolveGoogleNews} from "./monitor/google-news";
import {snapshotSource,sourceMedia,type MaterialSource,type SourceDocument} from "./source-context";
import {processImage,saveAsset,loadAsset} from "./assets";
import {copyAssetToItem,IMAGE_KINDS} from "./item-images";

export async function readSourceDocument(input:{title:string;url:string;body?:string;media?:SourceDocument['media'];date?:string}):Promise<SourceDocument> {
 try {
  const url=await resolveGoogleNews(input.url);
  const page=await safeFetchText(url,{maxBytes:3000000});
  const article=await extractArticle(page.text,page.url);
  if(!article)throw new Error("Текст статьи недоступен");
  return {title:article.title||input.title,url:page.url,body:article.text,media:[...article.media,...(input.media??[])].filter((m,i,a)=>a.findIndex(x=>x.url===m.url)===i),status:"full",date:input.date};
 }catch{return {title:input.title,url:input.url,body:input.body??"",media:input.media??[],status:"excerpt",date:input.date,note:"Пока сохранён анонс. При создании мы автоматически повторим загрузку полной статьи."};}
}
/** Upgrade old news/trend ideas once. Saving the source does not overwrite edited topic, hook, or body. */
export async function ensureMaterialSource(orgId:string,itemId:string):Promise<MaterialSource|undefined> {
 const row=await one<{meta:{source?:MaterialSource;fromNews?:boolean;fromTrends?:boolean;trendRun?:string}}>("select meta from kz_content_items where id=$1 and org_id=$2",[itemId,orgId]);
 const source=row?.meta.source;
 if(!source)return source;
 if(source.snapshotVersion){
  if(!source.documents?.some(d=>d.status!=="full"))return source;
  const docs=await Promise.all(source.documents.map(async d=>{
   if(d.status==="full")return d;
   const cached=await one<{full_text:string;media:SourceDocument['media'];url:string}>("select full_text,media,url from kz_feed_items where org_id=$1 and (id::text=$2 or url=$3) and full_status=$4 and full_text is not null order by fetched_at desc limit 1",[orgId,source.newsId??"",d.url,ARTICLE_STATUS]);
   return cached?{...d,url:cached.url,body:cached.full_text,media:cached.media??d.media,status:"full" as const}:readSourceDocument(d);
  }));
  const updated=snapshotSource(docs,source.instructions,{name:source.name,newsId:source.newsId,trendRun:source.trendRun});
  await q("update kz_content_items set meta=jsonb_set(meta,'{source}',$3::jsonb) where id=$1 and org_id=$2 and meta->'source'=$4::jsonb",[itemId,orgId,JSON.stringify(updated),JSON.stringify(source)]);
  return updated;
 }
 if(!row?.meta.fromNews&&!row?.meta.fromTrends)return source;
 let docs:SourceDocument[]=[];
 if(row.meta.fromTrends&&row.meta.trendRun){
  const run=await one<{result:{sources:{id:number;title:string;url:string;summary:string;date:string}[];ideas:{id:string;sources:number[];title:string}[]}}>("select result from kz_trend_runs where id::text=$1 and org_id=$2",[row.meta.trendRun,orgId]);
  const idea=run?.result.ideas.find(i=>i.title===source.title);
  const selected=run?.result.sources.filter(s=>idea?.sources.includes(s.id))??[];
  docs=await Promise.all(selected.map(s=>readSourceDocument({...s,body:s.summary})));
 }
 if(!docs.length){
  const news=await one<{title:string;url:string;full_text:string;media:SourceDocument['media']}>("select title,url,full_text,media from kz_feed_items where org_id=$1 and (id::text=$2 or url=$3) and full_status=$4 and full_text is not null order by fetched_at desc limit 1",[orgId,source.newsId??"",source.url,ARTICLE_STATUS]);
  docs=news?[{...news,body:news.full_text,status:"full"}]:[await readSourceDocument({title:source.title,url:source.url,body:source.body,media:source.media})];
 }
 const snapshot=snapshotSource(docs,source.instructions||source.body,{newsId:source.newsId,trendRun:source.trendRun});
 await q("update kz_content_items set meta=jsonb_set(meta,'{source}',$3::jsonb) where id=$1 and org_id=$2 and meta->'source'=$4::jsonb",[itemId,orgId,JSON.stringify(snapshot),JSON.stringify(source)]);
 return snapshot;
}
/** Original source photos can become the post image; preserve them as owned files and do not redraw them automatically. */
export async function attachSourceImage(orgId:string,itemId:string,source?:MaterialSource):Promise<boolean> {
 const row=await one<{brand_id:string;kind:string;image_id:string|null;meta:{imageOwn?:boolean;sourceImageDisabled?:boolean}}>("select brand_id,kind,image_id,meta from kz_content_items where id=$1 and org_id=$2",[itemId,orgId]);
 if(!row||!IMAGE_KINDS.includes(row.kind)||row.image_id||row.meta.sourceImageDisabled)return !!row?.image_id;
 const photo=sourceMedia(source).find(m=>m.type==='image'&&m.url);
 if(!photo?.url)return false;
 try{
  let archiveId=photo.assetId;
  if(!archiveId){
   const result=await safeFetchBuffer(photo.url,10000000);
   const image=await processImage(result.data,"generated");
   archiveId=await saveAsset(orgId,row.brand_id,"generated","source-original.jpg",image,"Сохранённое изображение источника",{itemId,position:-3});
   if(source){
    const mark=(media:SourceDocument['media'])=>media.map(m=>m.url===photo.url?{...m,assetId:archiveId}:m);
    const updated={...source,media:mark(source.media??[]),documents:source.documents?.map(d=>({...d,media:mark(d.media??[])}))};
    await q("update kz_content_items set meta=jsonb_set(meta,'{source}',$3::jsonb) where id=$1 and org_id=$2 and meta->'source'=$4::jsonb",[itemId,orgId,JSON.stringify(updated),JSON.stringify(source)]);
   }
  }
  if(!await copyAssetToItem(orgId,archiveId,itemId))return false;
  await q("update kz_content_items set meta=meta||jsonb_build_object('sourceImage',true) where id=$1 and org_id=$2",[itemId,orgId]);
  return true;
 }catch{return false;}
}
