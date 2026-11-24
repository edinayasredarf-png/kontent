import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { freshTrendSources, cleanTrendReport } from "../src/lib/trends-data";
import { trendToMaterial } from "../src/lib/trends";

const now = Date.parse("2026-11-24T12:00:00Z");
const item = (title: string, date = now - 1000, url = "https://publisher.example/story") => ({ title, publishedAt: new Date(date), url, body: "RSS excerpt", extId: title });
test("trend evidence rejects stale, future, undated and unsafe sources and duplicate headlines", () => {
 const rows = freshTrendSources([item("Fresh"),item("FRESH!"),item("Old",now-8*86400000),item("Future",now+86400000),item("Invalid",NaN),item("Unsafe",now,"javascript:alert(1)")],7,now);
 assert.equal(rows.length,1);assert.equal(rows[0].title,"Fresh");assert.equal(rows[0].id,1);
 assert.equal(freshTrendSources([item("Old",now-8*86400000)],30,now).length,1);
});
test("AI ideas must cite actual evidence; model-supplied URLs and unsupported metrics never become source links", () => {
 const sources=freshTrendSources([item("Fresh")],7,now);
 const valid={title:"Idea",hook:"Hook",fit:"Brand fit",angle:"Angle",sources:[1,999,"1",1],kind:"carousel",url:"https://fake.example"};
 const result=cleanTrendReport({ideas:[{...valid,sources:[999]},valid,{...valid,title:"IDEA"}]},sources);
 assert.equal(result.ideas.length,1);assert.deepEqual(result.ideas[0].sources,[1]);assert.equal(result.sources[0].url,"https://publisher.example/story");
 assert.throws(()=>cleanTrendReport({ideas:[{...valid,sources:[999]}]},sources),/подтверждёнными/);
});
test("trend materials retain evidence and tenant brand, repeated clicks reuse the same item, other tenants cannot read the run", async () => {
 const db=await PGlite.create(), state=globalThis as typeof globalThis & {_pool?:unknown}, old=state._pool;
 const query=(sql:string,params:unknown[]=[])=>db.query(sql,params);
 try {
  await db.exec(await readFile(new URL("../db/adminer-schema.sql",import.meta.url),"utf8"));
  state._pool={query,connect:async()=>({query,release(){}})};
  const {rows:[org]}=await db.query<{id:string}>("insert into kz_orgs(name,unlimited) values('Trends',true) returning id");
  const {rows:[other]}=await db.query<{id:string}>("insert into kz_orgs(name,unlimited) values('Other',true) returning id");
  const {rows:[brand]}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'Brand') returning id",[org.id]);
  const {rows:[fac]}=await db.query<{id:string}>("insert into kz_factories(org_id,brand_id,name) values($1,$2,'Factory') returning id",[org.id,brand.id]);
  const report=cleanTrendReport({ideas:[{title:"Topic",hook:"Hook",fit:"Audience",angle:"Explain",sources:[1],kind:"post"}]},freshTrendSources([item("Evidence")],7,now));
  report.sources[0].text="RSS excerpt plus full verified article, final fact";
  const {rows:[run]}=await db.query<{id:string}>("insert into kz_trend_runs(org_id,factory_id,query,days,result) values($1,$2,'Niche',7,$3) returning id",[org.id,fac.id,JSON.stringify(report)]);
  await assert.rejects(trendToMaterial(other.id,run.id,"1"),/не найдена/);
  const id=await trendToMaterial(org.id,run.id,"1");
  assert.equal(await trendToMaterial(org.id,run.id,"1"),id);
  const {rows:[saved]}=await db.query<{org_id:string;brand_id:string;status:string;meta:{source:{body:string;url:string}}}>("select org_id,brand_id,status,meta from kz_content_items where id=$1",[id]);
  assert.equal(saved.org_id,org.id);assert.equal(saved.brand_id,brand.id);assert.equal(saved.status,"idea");
  assert.match(saved.meta.source.body,/RSS excerpt/);assert.equal(saved.meta.source.url,"https://publisher.example/story");
  assert.equal((await db.query("select * from kz_content_items")).rows.length,1);
  assert.equal((await db.query("select * from kz_wallet_tx")).rows.length,0);
 } finally {state._pool=old;await db.close();}
});
