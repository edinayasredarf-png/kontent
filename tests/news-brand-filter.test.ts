import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseFilter, filterQuery, feedWhere } from "../src/lib/monitor/feed-query";
import { setSourceBrands, validateSourceBrands } from "../src/lib/monitor/source-brands";

test("brand filter survives links and rejects invalid input", () => {
 const brand="11111111-1111-1111-1111-111111111111";
 const f=parseFilter({brand,show:"saved",q:"новость",d:"30"});
 assert.equal(parseFilter({brand:"bad'"}).brand,"");
 const params=new URLSearchParams(filterQuery(f));
 assert.equal(params.get("brand"),brand); assert.equal(params.get("show"),"saved");
 assert.equal(params.get("q"),"новость");
});
test("brand sources isolate feeds and polling counts; reassignment preserves source metadata and rejects cross-tenant brands", async () => {
 const db=await PGlite.create(), g=globalThis as typeof globalThis&{_pool?:unknown}, previous=g._pool;
 try {
  await db.exec(await readFile(new URL('../db/adminer-schema.sql',import.meta.url),'utf8'));
  g._pool={query:(sql:string,args:unknown[])=>db.query(sql,args)};
  const {rows:[org]}=await db.query<{id:string}>("insert into kz_orgs(name) values('News') returning id");
  const {rows:[foreign]}=await db.query<{id:string}>("insert into kz_orgs(name) values('Foreign') returning id");
  const {rows:brands}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'A'),($1,'B') returning id",[org.id]);
  const {rows:[other]}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'Other') returning id",[foreign.id]);
  const sources:string[]=[];
  for(let i=0;i<3;i++){
   const {rows:[s]}=await db.query<{id:string}>("insert into kz_sources(org_id,kind,ref,title,config) values($1,'news',$2,$2,'{\"avatar\":\"kept\"}') returning id",[org.id,String(i)]); sources.push(s.id);
   await db.query("insert into kz_feed_items(org_id,source_id,ext_id,url,title) values($1,$2,'one','https://example.com','News')",[org.id,s.id]);
  }
  await setSourceBrands(org.id,sources[0],[brands[0].id]);
  await setSourceBrands(org.id,sources[1],[brands[1].id]);
  const list=async(params:Record<string,string>,since?:string)=>{ const w=feedWhere(org.id,parseFilter(params),since);return (await db.query<{source_id:string}>(`select i.source_id from kz_feed_items i where ${w.sql}`,w.args)).rows.map(r=>r.source_id); };
  assert.equal((await list({})).length,3);
  assert.deepEqual(await list({brand:brands[0].id}),[sources[0]]);
  assert.deepEqual(await list({brand:brands[1].id},'2000-01-01T00:00:00Z'),[sources[1]]);
  await setSourceBrands(org.id,sources[0],brands.map(b=>b.id));
  assert.equal((await list({brand:brands[1].id})).length,2);
  assert.equal((await db.query<{config:{avatar:string}}>("select config from kz_sources where id=$1",[sources[0]])).rows[0].config.avatar,'kept');
  await assert.rejects(validateSourceBrands(org.id,[other.id]),/недоступен/);
  await assert.rejects(setSourceBrands(foreign.id,sources[0],[]),/недоступен/);
  assert.deepEqual(await list({brand:other.id}),[]);
  await setSourceBrands(org.id,sources[0],[]);
  assert.deepEqual(await list({brand:brands[0].id}),[]);
 } finally {g._pool=previous; await db.close();}
});
