import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {snapshotSource,sourcePrompt,sourceMedia} from "../src/lib/source-context";
import {genPost} from "../src/lib/ai";
import {planCarousel} from "../src/lib/creator/plan";
import {createFromNews} from "../src/lib/monitor/news";
import {ensureMaterialSource,attachSourceImage} from "../src/lib/material-source";
import {removeItemImage} from "../src/lib/item-images";

const full='Важный исходный материал. '.repeat(700)+'ФАКТ_В_КОНЦЕ: дата запуска 17 декабря, лимит 42 заявки.';
const snapshot=()=>snapshotSource([{title:'Статья',url:'https://publisher.example/story',body:full,status:'full',media:[{type:'image',url:'https://publisher.example/photo.jpg',name:'Объект из статьи'}]},{title:'Второй источник',url:'https://publisher.example/second',body:'НЕЗАВИСИМЫЙ_ИСТОЧНИК: подтверждённая деталь.',status:'full',media:[]}],'ПОДАЧА_ДЛЯ_БРЕНДА: объяснить пользу компании');
test('source snapshot retains complete text, selected angle, every document and image',()=>{
 const source=JSON.parse(JSON.stringify(snapshot()));
 assert.equal(source.documents[0].body,full);assert.match(sourcePrompt(source),/ФАКТ_В_КОНЦЕ/);assert.match(sourcePrompt(source),/НЕЗАВИСИМЫЙ_ИСТОЧНИК/);assert.match(sourcePrompt(source),/ПОДАЧА_ДЛЯ_БРЕНДА/);assert.match(sourcePrompt(source),/photo.jpg/);assert.equal(sourceMedia(source).length,1);
 const shortened=sourcePrompt(source,8000);assert.match(shortened,/ФАКТ_В_КОНЦЕ/);assert.match(shortened,/НЕЗАВИСИМЫЙ_ИСТОЧНИК/);assert.equal(source.documents[0].body,full);
});
test('real post generation sends the full source context instead of dropping facts after 6000 characters',async()=>{
 const g=globalThis as typeof globalThis&{_pool?:unknown},previous=g._pool,oldFetch=globalThis.fetch,oldUrl=process.env.SELFHOSTED_LLM_URL,oldModel=process.env.SELFHOSTED_LLM_MODEL;let user='';
 try{
  g._pool={query:async()=>({rows:[]})};process.env.SELFHOSTED_LLM_URL='https://gateway.example/v1';process.env.SELFHOSTED_LLM_MODEL='test';
  globalThis.fetch=async(_url,options)=>{user=JSON.parse(String(options?.body)).messages[1].content;return new Response(JSON.stringify({choices:[{message:{content:'Готовый пост по исходным материалам. Факты проверены по статье.'}}]}));};
  await genPost({name:'Brand',description:'Company',audience:'Readers',tone:'calm',forbidden:[]},'Product','Niche','Новая тема','Новый хук','post',snapshot());
  assert.match(user,/ФАКТ_В_КОНЦЕ/);assert.match(user,/НЕЗАВИСИМЫЙ_ИСТОЧНИК/);assert.match(user,/ПОДАЧА_ДЛЯ_БРЕНДА/);assert.match(user,/photo.jpg/);
 }finally{g._pool=previous;globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SELFHOSTED_LLM_URL;else process.env.SELFHOSTED_LLM_URL=oldUrl;if(oldModel===undefined)delete process.env.SELFHOSTED_LLM_MODEL;else process.env.SELFHOSTED_LLM_MODEL=oldModel;}
});
test('news creation and later edits retain full article/media; archived source image survives removing the publication image',async()=>{
 const db=await PGlite.create(),g=globalThis as typeof globalThis&{_pool?:unknown},old=g._pool;
 const query=(sql:string,args:unknown[]=[])=>db.query(sql,args);
 try{
  await db.exec(await readFile(new URL('../db/adminer-schema.sql',import.meta.url),'utf8'));g._pool={query,connect:async()=>({query,release(){}})};
  const {rows:[org]}=await db.query<{id:string}>("insert into kz_orgs(name) values('Context') returning id");
  const {rows:[brand]}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'Brand') returning id",[org.id]);
  const {rows:[fac]}=await db.query<{id:string}>("insert into kz_factories(org_id,brand_id,name) values($1,$2,'Factory') returning id",[org.id,brand.id]);
  const {rows:[src]}=await db.query<{id:string}>("insert into kz_sources(org_id,kind,ref,title) values($1,'news','query','News') returning id",[org.id]);
  const media=[{type:'image',url:'https://publisher.example/photo.jpg'}];
  const {rows:[news]}=await db.query<{id:string}>("insert into kz_feed_items(org_id,source_id,ext_id,url,title,body,full_text,full_status,media) values($1,$2,'one','https://publisher.example/story','Title','Excerpt',$3,'article-v2',$4::jsonb) returning id",[org.id,src.id,full,JSON.stringify(media)]);
  const made=await createFromNews(org.id,news.id,fac.id,['post'],false,{note:'Keep the final fact'});assert.ok(made.ok);if(!made.ok)return;
  const id=made.ids[0];
  await db.query("update kz_content_items set topic='Edited topic',hook='Edited hook' where id=$1",[id]);
  const context=await ensureMaterialSource(org.id,id);assert.equal(context?.documents?.[0].body,full);assert.equal(context?.media?.[0].url,media[0].url);assert.match(context?.instructions??'',/Keep the final fact/);
  const {rows:[archive]}=await db.query<{id:string}>("insert into kz_assets(org_id,brand_id,item_id,kind,position,name,mime,data,width,height,size) values($1,$2,$3,'generated',-3,'source.jpg','image/jpeg',$4,1,1,4) returning id",[org.id,brand.id,id,Buffer.from('jpeg')]);
  context!.media![0].assetId=archive.id;context!.documents![0].media[0].assetId=archive.id;
  await db.query("update kz_content_items set meta=jsonb_set(meta,'{source}',$2::jsonb),status='ready' where id=$1",[id,JSON.stringify(context)]);
  assert.equal(await attachSourceImage(org.id,id,context),true);
  const {rows:[image]}=await db.query<{image_id:string}>("select image_id from kz_content_items where id=$1",[id]);assert.notEqual(image.image_id,archive.id);
  assert.ok((await removeItemImage(org.id,id)).ok);assert.equal(await attachSourceImage(org.id,id,context),false);
  assert.equal((await db.query('select id from kz_assets where id=$1',[archive.id])).rows.length,1);
  const {rows:[saved]}=await db.query<{topic:string;hook:string;meta:{source:unknown}}>('select topic,hook,meta from kz_content_items where id=$1',[id]);assert.equal(saved.topic,'Edited topic');assert.equal(saved.hook,'Edited hook');assert.deepEqual(saved.meta.source,context);
 }finally{g._pool=old;await db.close();}
});

test('manual carousel retains a pasted article beyond the short topic field',async()=>{
 const g=globalThis as typeof globalThis&{_pool?:unknown},previous=g._pool,oldFetch=globalThis.fetch,oldUrl=process.env.SELFHOSTED_LLM_URL,oldModel=process.env.SELFHOSTED_LLM_MODEL;let user='';
 try{
  g._pool={query:async()=>({rows:[]})};process.env.SELFHOSTED_LLM_URL='https://gateway.example/v1';process.env.SELFHOSTED_LLM_MODEL='test';
  globalThis.fetch=async(_url,options)=>{user=JSON.parse(String(options?.body)).messages[1].content;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({slides:[1,2,3].map(n=>({title:'Слайд '+n,body:'Текст',visual:'Scene'})),caption:'Подпись',style:'Photo'})}}]}));};
  const plan=await planCarousel({brand:{name:'Brand',description:'Company',audience:'Readers',tone:'calm',forbidden:[]},product:'Product',niche:'Niche',prompt:full,n:3});
  assert.match(user,/ФАКТ_В_КОНЦЕ/);assert.equal(plan.source?.documents?.[0].body,full);
 }finally{g._pool=previous;globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SELFHOSTED_LLM_URL;else process.env.SELFHOSTED_LLM_URL=oldUrl;if(oldModel===undefined)delete process.env.SELFHOSTED_LLM_MODEL;else process.env.SELFHOSTED_LLM_MODEL=oldModel;}
});
