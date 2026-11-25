import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {brandLogoState,recentWorks} from '../src/lib/creator/data';
import {sameBrand,studioForFactory} from '../src/lib/creator/scope';
import {cleanSettings} from '../src/lib/postsettings';
import {genPost} from '../src/lib/ai';

test('switching factories drops brand-specific image settings and excludes other or unassigned presets',()=>{
 const previous={model:'image',quality:'1k' as const,format:'portrait' as const,n:8,textInImage:true,logo:true,logoPos:'tl' as const,style:'Brand A logo palette',structure:'Brand A contact and hashtag'};
 const next=studioForFactory(previous,false);
 assert.equal(next.logo,false);assert.equal(next.style,'');assert.equal(next.structure,'');assert.equal(next.textInImage,false);
 assert.equal(next.model,previous.model);assert.equal(studioForFactory(previous,true).logo,true);
 assert.equal(sameBrand('a','b'),false);assert.equal(sameBrand(null,'b'),false);assert.equal(sameBrand('b','b'),true);
});
test('empty brand never borrows another brand logo or recent work identity',async()=>{
 const db=await PGlite.create(),g=globalThis as typeof globalThis&{_pool?:unknown},previous=g._pool;
 try{
  await db.exec(await readFile(new URL('../db/adminer-schema.sql',import.meta.url),'utf8'));
  g._pool={query:(sql:string,args:unknown[])=>db.query(sql,args)};
  const {rows:[org]}=await db.query<{id:string}>("insert into kz_orgs(name) values('Isolation') returning id");
  const {rows:brands}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'A'),($1,'B') returning id",[org.id]);
  await db.query("insert into kz_assets(org_id,brand_id,kind,name,mime,width,height,size,data) values($1,$2,'logo','a.png','image/png',1,1,1,$3)",[org.id,brands[0].id,Buffer.from('x')]);
  const logos=await brandLogoState(org.id,brands.map(b=>b.id));assert.equal(logos[brands[0].id],true);assert.equal(logos[brands[1].id],false);
  await db.query("insert into kz_content_items(org_id,brand_id,kind,topic,body,status) values($1,$2,'post','A','A source','ready'),($1,$3,'post','B','B source','ready')",[org.id,brands[0].id,brands[1].id]);
  const recent=await recentWorks(org.id);const own=recent.filter(w=>sameBrand(w.brandId,brands[1].id));assert.equal(own.length,1);assert.equal(own[0].title,'B');
 }finally{g._pool=previous;await db.close();}
});
test('post generation removes foreign links and hashtags when brand settings are blank',async()=>{
 const g=globalThis as typeof globalThis&{_pool?:unknown},previous=g._pool,oldFetch=globalThis.fetch,oldUrl=process.env.SELFHOSTED_LLM_URL,oldModel=process.env.SELFHOSTED_LLM_MODEL;
 try{
  g._pool={query:async()=>({rows:[]})};process.env.SELFHOSTED_LLM_URL='https://gateway.example/v1';process.env.SELFHOSTED_LLM_MODEL='test';
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'Полезный пост для аудитории. https://brand-a.example/ https://brand-b.example/ #БрендА #Тема'}}]}));
  const brand={name:'Brand B',description:'',audience:'',tone:'',forbidden:[]};
  const blank=cleanSettings({});assert.equal(blank.link,'');assert.equal(blank.hashtags,'none');
  const result=await genPost(brand,'Продукт','Ниша','Тема','Начало','post',undefined,blank);
  assert.doesNotMatch(result,/https?:|БрендА|#Тема/);
  const configured=await genPost(brand,'Продукт','Ниша','Тема','Начало','post',undefined,cleanSettings({link:'https://brand-b.example/'}));
  assert.match(configured,/https:\/\/brand-b.example\//);assert.doesNotMatch(configured,/brand-a/);
 }finally{g._pool=previous;globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SELFHOSTED_LLM_URL;else process.env.SELFHOSTED_LLM_URL=oldUrl;if(oldModel===undefined)delete process.env.SELFHOSTED_LLM_MODEL;else process.env.SELFHOSTED_LLM_MODEL=oldModel;}
});
