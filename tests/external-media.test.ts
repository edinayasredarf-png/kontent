import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vkPostImages } from "../src/lib/external-media";
import { addExternalPost, refreshExternal, externalImages, listExternal } from "../src/lib/external-posts";

test("VK extracts largest photos, reposts, link previews and rejects unsafe schemes", () => {
  assert.deepEqual(vkPostImages({attachments:[{type:"photo",photo:{sizes:[{url:"https://cdn.test/small",width:10},{url:"https://cdn.test/large",width:100}]}},{type:"link",link:{photo:{sizes:[{url:"https://cdn.test/link",width:200}]}}},{type:"photo",photo:{sizes:[{url:"javascript:alert(1)",width:1000}]}}],copy_history:[{attachments:[{type:"photo",photo:{sizes:[{url:"https://cdn.test/large",width:100}]}},{type:"photo",photo:{sizes:[{url:"https://cdn.test/repost",width:200}]}}]}]}),["https://cdn.test/large","https://cdn.test/link","https://cdn.test/repost"]);
});
test("analytics persists image imports and backfills old posts without losing statistics or crossing organizations",async()=>{
  const db=await PGlite.create(), g=globalThis as typeof globalThis & {_pool?:unknown}, oldPool=g._pool, oldFetch=globalThis.fetch, oldToken=process.env.VK_SERVICE_TOKEN;
  let images=true;
  globalThis.fetch=async()=>Response.json({response:{items:[{id:123,owner_id:-42,date:1700000000,text:"Post",views:{count:12},attachments:images?[{type:"photo",photo:{sizes:[{url:"https://cdn.test/image.jpg",width:800}]}}]:[]}],groups:[{name:"Community"}]}});
  process.env.VK_SERVICE_TOKEN="test";
  try{
    await db.exec(await readFile(new URL("../db/adminer-schema.sql",import.meta.url),"utf8"));
    const query=(sql:string,params:unknown[]=[])=>db.query(sql,params);g._pool={query,connect:async()=>({query,release(){}})};
    const org=(await db.query<{id:string}>("insert into kz_orgs(name) values('Media') returning id")).rows[0].id;
    const other=(await db.query<{id:string}>("insert into kz_orgs(name) values('Other') returning id")).rows[0].id;
    const result=await addExternalPost(org,null,"https://vk.com/wall-42_123");assert.ok(result.ok);if(!result.ok)return;
    assert.equal((await listExternal(org,{}))[0].image_count,1);
    assert.deepEqual(await externalImages(org,result.id),["https://cdn.test/image.jpg"]);
    assert.deepEqual(await externalImages(other,result.id),[]);
    await db.query("update kz_external_posts set images='{}',media_checked_at=null where id=$1",[result.id]);
    assert.deepEqual(await externalImages(org,result.id),["https://cdn.test/image.jpg"]);
    assert.equal(Number((await db.query<{n:string}>("select count(*) n from kz_external_stats where post_id=$1",[result.id])).rows[0].n),1);
    images=false;await refreshExternal(result.id);
    assert.deepEqual(await externalImages(org,result.id),[]);
  }finally{globalThis.fetch=oldFetch;g._pool=oldPool;if(oldToken===undefined)delete process.env.VK_SERVICE_TOKEN;else process.env.VK_SERVICE_TOKEN=oldToken;await db.close();}
});
