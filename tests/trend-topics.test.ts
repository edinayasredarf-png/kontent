import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {suggestTrendTopics} from "../src/lib/trends";
import {withUsage} from "../src/lib/billing";
import {PRICES} from "../src/lib/wallet";

test("brief-derived topics are charged once, reuse only the current brief and refund invalid AI output",async()=>{
 const db=await PGlite.create(),g=globalThis as typeof globalThis&{_pool?:unknown},previous=g._pool,oldFetch=globalThis.fetch;
 const oldUrl=process.env.SELFHOSTED_LLM_URL,oldModel=process.env.SELFHOSTED_LLM_MODEL;
 let requests=0,invalid=false;
 const query=(sql:string,args:unknown[]=[])=>/pg_try_advisory_lock/.test(sql)?Promise.resolve({rows:[{ok:true}]}):/pg_advisory_unlock/.test(sql)?Promise.resolve({rows:[]}):db.query(sql,args);
 try{
  await db.exec(await readFile(new URL('../db/adminer-schema.sql',import.meta.url),'utf8'));g._pool={query,connect:async()=>({query,release(){}})};
  process.env.SELFHOSTED_LLM_URL='https://gateway.example/v1';process.env.SELFHOSTED_LLM_MODEL='test-model';
  globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({choices:[{message:{content:invalid?'bad output':JSON.stringify({topics:['Освещение растений','Уход зимой','Освещение растений']})}}],usage:{prompt_tokens:5,completion_tokens:10}}),{headers:{'Content-Type':'application/json'}});};
  const {rows:[org]}=await db.query<{id:string}>("insert into kz_orgs(name,plan,plan_until,balance_kop,token_value_kop) values('Topics','business',now()+interval '30 days',5000,5000) returning id");
  const {rows:[brand]}=await db.query<{id:string}>("insert into kz_brands(org_id,name,description) values($1,'Plants','Flowers for home') returning id",[org.id]);
  const {rows:[fac]}=await db.query<{id:string}>("insert into kz_factories(org_id,brand_id,name,niche) values($1,$2,'Flowers','Plants') returning id",[org.id,brand.id]);
  const call=()=>withUsage({orgId:org.id},()=>suggestTrendTopics(org.id,fac.id));
  const balance=async()=>Number((await db.query<{n:string}>("select balance_kop n from kz_orgs where id=$1",[org.id])).rows[0].n);
  assert.deepEqual(await call(),['Освещение растений','Уход зимой']);assert.equal(await balance(),5000-PRICES.idea);
  await call();assert.equal(requests,1);assert.equal(await balance(),5000-PRICES.idea);
  await db.query("update kz_brands set description='New brief' where id=$1",[brand.id]);await call();assert.equal(requests,2);assert.equal(await balance(),5000-2*PRICES.idea);
  await db.query("update kz_brands set description='Another brief' where id=$1",[brand.id]);invalid=true;
  await assert.rejects(call(),/подобрать темы/);assert.equal(await balance(),5000-2*PRICES.idea);
 }finally{
  globalThis.fetch=oldFetch;g._pool=previous;
  if(oldUrl===undefined)delete process.env.SELFHOSTED_LLM_URL;else process.env.SELFHOSTED_LLM_URL=oldUrl;
  if(oldModel===undefined)delete process.env.SELFHOSTED_LLM_MODEL;else process.env.SELFHOSTED_LLM_MODEL=oldModel;
  await db.close();
 }
});
