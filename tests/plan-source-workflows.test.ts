import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {changeIdeaKind} from '../src/lib/idea-kind';
import {loadPlanEvidence,evidenceSource} from '../src/lib/plan-evidence';
import {planBases} from '../src/lib/plan-bases';
import {ensureMaterialSource} from '../src/lib/material-source';
import {snapshotSource} from '../src/lib/source-context';
import {genPlan} from '../src/lib/ai';
import {runEdit} from '../src/lib/text-tools';

test('editing rejects formatting-only success and retries the actual command',async()=>{
 const text='Город хранит сведения об объектах в разных документах. Сотрудникам приходится искать записи вручную.';
 let calls=0;
 const bad=await runEdit(async()=>{calls++;return `<p>${text}</p>`;},text,'polish');
 assert.equal(bad.ok,false);assert.equal(calls,2);
 const good=await runEdit(async()=> 'Данные об объектах разбросаны по документам — сотрудникам приходится вручную искать нужные записи.',text,'simple');assert.equal(good.ok,true);
 assert.equal((await runEdit(async()=>text,text,'fix')).ok,true);
 assert.deepEqual(planBases(undefined),['topic','news','trends']);assert.throws(()=>planBases([]));assert.throws(()=>planBases(['invalid']));
});

test('retry upgrades an excerpt from cached full text; changing idea type preserves context and blocks stale/foreign/ready updates',async()=>{
 const db=await PGlite.create(),g=globalThis as typeof globalThis&{_pool?:unknown},old=g._pool;
 try{
  await db.exec(await readFile(new URL('../db/adminer-schema.sql',import.meta.url),'utf8'));
  const query=(sql:string,args:unknown[])=>db.query(sql,args);g._pool={query,connect:async()=>({query,release(){}})};
  const {rows:[org]}=await db.query<{id:string}>("insert into kz_orgs(name) values('Plan') returning id");
  const {rows:[other]}=await db.query<{id:string}>("insert into kz_orgs(name) values('Other') returning id");
  const {rows:[brand]}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'Company') returning id",[org.id]);
  const {rows:[second]}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'Second') returning id",[org.id]);
  const {rows:[fac]}=await db.query<{id:string}>("insert into kz_factories(org_id,brand_id,name) values($1,$2,'Factory') returning id",[org.id,brand.id]);
  const full='Полная статья о цифровом реестре. '.repeat(80)+'КОНЕЧНЫЙ_ФАКТ: запуск в декабре.';
  let newsId='';
  for(const [i,b] of [brand.id,second.id].entries()){
   const {rows:[src]}=await db.query<{id:string}>("insert into kz_sources(org_id,kind,ref,title,config) values($1,'news',$2,'Source',$3::jsonb) returning id",[org.id,String(i),JSON.stringify({brandIds:[b]})]);
   const {rows:[news]}=await db.query<{id:string}>("insert into kz_feed_items(org_id,source_id,ext_id,url,title,body,full_text,full_status,media) values($1,$2,'one',$3,$4,'Анонс',$5,'article-v2',$6::jsonb) returning id",[org.id,src.id,`https://publisher.example/${i}`,i?'Чужой бренд':'Новая статья',full,JSON.stringify([{type:'image',url:'https://publisher.example/image.jpg'}])]);
   if(!i)newsId=news.id;
  }
  const source=snapshotSource([{title:'Статья',url:'https://publisher.example/0',body:'Анонс',media:[],status:'excerpt'}],'Выбранная подача',{newsId});
  const {rows:[item]}=await db.query<{id:string;version:string}>("insert into kz_content_items(org_id,brand_id,factory_id,kind,topic,hook,planned_for,meta) values($1,$2,$3,'carousel','Тема','Хук','2026-12-03',$4::jsonb) returning id,updated_at::text version",[org.id,brand.id,fac.id,JSON.stringify({source,calendarColor:'blue'})]);
  const refreshed=await ensureMaterialSource(org.id,item.id);assert.equal(refreshed?.documents?.[0].status,'full');assert.equal(refreshed?.documents?.[0].body,full);assert.equal(refreshed?.media?.length,1);
  assert.equal((await changeIdeaKind(other.id,item.id,'post',item.version)).ok,false);
  assert.equal((await changeIdeaKind(org.id,item.id,'post',item.version)).ok,true);
  const {rows:[saved]}=await db.query<{kind:string;topic:string;hook:string;planned_for:string;meta:{source:unknown;calendarColor:string}}>("select kind,topic,hook,planned_for,meta from kz_content_items where id=$1",[item.id]);
  assert.equal(saved.kind,'post');assert.equal(saved.topic,'Тема');assert.equal(saved.hook,'Хук');assert.equal(saved.meta.calendarColor,'blue');assert.deepEqual(saved.meta.source,JSON.parse(JSON.stringify(refreshed)));
  assert.equal((await changeIdeaKind(org.id,item.id,'carousel',item.version)).ok,false);
  await db.query("update kz_content_items set status='ready' where id=$1",[item.id]);
  assert.equal((await changeIdeaKind(org.id,item.id,'carousel',new Date().toISOString())).ok,false);
  const report={summary:'Обсуждается цифровизация',ideas:[{id:'1',title:'Реестр объектов',hook:'Начало',angle:'Объяснить практику',fit:'Для городских служб',kind:'post',sources:[1]}],sources:[{id:1,title:'Факт из тренда',url:'https://publisher.example/trend',summary:'Анонс',date:new Date().toISOString(),text:full,media:[{type:'image',url:'https://publisher.example/trend.jpg'}]}]};
  await db.query("insert into kz_trend_runs(org_id,factory_id,query,days,context_hash,result) values($1,$2,'реестры',7,'hash',$3::jsonb)",[org.id,fac.id,JSON.stringify(report)]);
  const trendEntries=await loadPlanEvidence(org.id,fac.id,brand.id,['trends']);assert.equal(trendEntries.length,1);assert.match(trendEntries[0].source.body,/КОНЕЧНЫЙ_ФАКТ/);assert.match(trendEntries[0].source.instructions??'',/Объяснить практику/);assert.equal(trendEntries[0].source.media?.length,1);
  assert.deepEqual(await loadPlanEvidence(org.id,fac.id,brand.id,['topic']),[]);
  const entries=await loadPlanEvidence(org.id,fac.id,brand.id,['news']);assert.equal(entries.length,1);assert.equal(entries[0].source.title,'Новая статья');assert.match(entries[0].source.body,/КОНЕЧНЫЙ_ФАКТ/);assert.equal(evidenceSource([entries[0].id],entries)?.media?.length,1);assert.equal(evidenceSource(['invented'],entries),undefined);
  assert.deepEqual(await loadPlanEvidence(other.id,fac.id,brand.id,['news','trends']),[]);
 }finally{g._pool=old;await db.close();}
});

test('plan model must cite real selected evidence and retains full source references',async()=>{
 const g=globalThis as typeof globalThis&{_pool?:unknown},old=g._pool,oldFetch=globalThis.fetch,oldUrl=process.env.SELFHOSTED_LLM_URL,oldModel=process.env.SELFHOSTED_LLM_MODEL;
 let prompt='';
 try{
  g._pool={query:async()=>({rows:[]})};process.env.SELFHOSTED_LLM_URL='https://gateway.example/v1';process.env.SELFHOSTED_LLM_MODEL='test';
  globalThis.fetch=async(_url,options)=>{prompt=JSON.parse(String(options?.body)).messages[1].content;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify([{topic:'Инвентаризация объектов города',hook:'Как работать с реестром',sourceIds:['news:one']},{topic:'Другая выдуманная тема',sourceIds:['invented']}])}}]}));};
  const entries=[{id:'news:one',type:'news' as const,source:snapshotSource([{title:'Новость',url:'https://publisher.example/story',body:'СОБЫТИЕ: новый реестр запущен 24 ноября.',media:[],status:'full'}])}];
  const ideas=await genPlan({name:'Company',description:'City software',audience:'Cities',tone:'calm',forbidden:[]},'Product','Niche',['post','carousel'],7,[],undefined,0,{entries,topical:false});
  assert.equal(ideas.length,1);assert.deepEqual(ideas[0].sourceIds,['news:one']);assert.match(prompt,/СОБЫТИЕ/);assert.match(prompt,/только предоставленные источники/);
 }finally{g._pool=old;globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SELFHOSTED_LLM_URL;else process.env.SELFHOSTED_LLM_URL=oldUrl;if(oldModel===undefined)delete process.env.SELFHOSTED_LLM_MODEL;else process.env.SELFHOSTED_LLM_MODEL=oldModel;}
});
