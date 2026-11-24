import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { collectStats } from "../src/lib/engage";
import { seal } from "../src/lib/crypto";
import { publishedAnalytics } from "../src/lib/published-analytics";

test("native published materials enter analytics without an external import or metrics, preserve slide order and respect filters/tenant",async()=>{
 const db=await PGlite.create(), state=globalThis as typeof globalThis & {_pool?:unknown}, previous=state._pool, oldFetch=globalThis.fetch;
 try{
  await db.exec(await readFile(new URL('../db/adminer-schema.sql',import.meta.url),'utf8'));state._pool={query:db.query.bind(db),connect:async()=>({query:db.query.bind(db),release(){}})};
  const {rows:[org]}=await db.query<{id:string}>("insert into kz_orgs(name) values('Analytics') returning id");
  const {rows:[other]}=await db.query<{id:string}>("insert into kz_orgs(name) values('Other') returning id");
  const {rows:[brand]}=await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'Brand') returning id",[org.id]);
  const {rows:[channel]}=await db.query<{id:string}>("insert into kz_channels(org_id,brand_id,kind,title) values($1,$2,'vk','VK') returning id",[org.id,brand.id]);
  const {rows:[item]}=await db.query<{id:string}>("insert into kz_content_items(org_id,brand_id,kind,topic,body,status) values($1,$2,'carousel','Topic','Text','published') returning id",[org.id,brand.id]);
  const {rows:[pub]}=await db.query<{id:string}>("insert into kz_publications(org_id,item_id,channel_id,status,external_url,published_at) values($1,$2,$3,'published','https://vk.com/wall-7_99','2026-11-24T10:00:00Z') returning id",[org.id,item.id,channel.id]);
  for(const pos of [1,-10,0])await db.query("insert into kz_assets(org_id,brand_id,item_id,kind,position,name,mime,data,width,height,size) values($1,$2,$3,'generated',$4,$5,'image/jpeg',$6,1080,1350,4)",[org.id,brand.id,item.id,pos,String(pos),Buffer.from('jpeg')]);
  const [row]=await publishedAnalytics(org.id,{});assert.equal(row.id,pub.id);assert.equal(row.body,'Text');assert.equal(row.last_fetched_at,null);assert.equal(row.assets.length,2);
  const {rows:ordered}=await db.query<{id:string}>("select id from kz_assets where item_id=$1 and position>=0 order by position",[item.id]);assert.deepEqual(row.assets,ordered.map(x=>x.id));
  assert.equal((await publishedAnalytics(org.id,{format:'carousel'})).length,1);assert.equal((await publishedAnalytics(org.id,{format:'post'})).length,0);
  assert.equal((await publishedAnalytics(org.id,{from:'2026-11-25'})).length,0);assert.equal((await publishedAnalytics(other.id,{},pub.id)).length,0);
  await db.query("insert into kz_post_stats(org_id,publication_id,views,likes,comments,reposts) values($1,$2,15,3,1,2)",[org.id,pub.id]);
  assert.equal((await publishedAnalytics(org.id,{}))[0].views,15);
  await db.query("update kz_channels set credentials=$2::jsonb where id=$1",[channel.id,JSON.stringify(seal({token:'group-key',photoToken:'user-key',target:'7'}))]);
  let calls=0;
  globalThis.fetch=async(_url,options)=>{calls++;const params=new URLSearchParams(String(options?.body));assert.equal(params.get('access_token'),'user-key');return new Response(JSON.stringify({response:{items:[{id:99,owner_id:-7,views:{count:35},likes:{count:4}}]}}));};
  assert.equal((await collectStats(1,other.id,pub.id)).updated,0);assert.equal(calls,0);
  assert.equal((await collectStats(1,org.id,pub.id)).updated,1);assert.equal(calls,1);
  assert.equal((await publishedAnalytics(org.id,{}))[0].views,35);
  assert.equal((await db.query('select * from kz_external_posts')).rows.length,0);
 }finally{globalThis.fetch=oldFetch;state._pool=previous;await db.close();}
});
