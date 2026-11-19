import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { analytics } from "../src/lib/engage";

test("analytics trend runs for empty portfolios and groups publications by the Moscow date", async () => {
  const db = await PGlite.create();
  const state = globalThis as typeof globalThis & { _pool?: unknown };
  const previousPool = state._pool;
  try {
    await db.exec(await readFile(new URL("../db/adminer-schema.sql", import.meta.url), "utf8"));
    state._pool = { query: db.query.bind(db) };
    const { rows: [org] } = await db.query<{ id: string }>("insert into kz_orgs(name) values('Analytics test') returning id");
    const range = { from: "2026-11-01", to: "2026-11-02" };
    assert.deepEqual((await analytics(org.id, range, true)).trend, []);
    await db.query(`with brand as (
        insert into kz_brands(org_id,name) values($1,'Brand') returning id
      ), channel as (
        insert into kz_channels(org_id,brand_id,kind,title) select $1,id,'telegram','Channel' from brand returning id
      ), item as (
        insert into kz_content_items(org_id,brand_id,topic,status) select $1,id,'Post','published' from brand returning id
      ), publication as (
        insert into kz_publications(org_id,item_id,channel_id,status,published_at)
        select $1,item.id,channel.id,'published','2026-11-01T22:00:00Z' from item cross join channel returning id
      )
      insert into kz_post_stats(org_id,publication_id,views,likes,comments,reposts)
      select $1,id,100,7,2,1 from publication`, [org.id]);
    assert.deepEqual((await analytics(org.id, range, true)).trend, [
      { day: "2026-11-02", views: 100, likes: 7, comments: 2, reposts: 1 },
    ]);
    assert.deepEqual((await analytics(org.id, { ...range, to: "2026-11-01" }, true)).trend, []);
    const { rows: [external] } = await db.query<{ id: string }>(`insert into kz_external_posts(org_id,kind,url,ext_ref,body,posted_at)
      values($1,'vk','https://vk.com/wall-1_1','-1_1','Imported post','2026-11-01T23:00:00Z') returning id`, [org.id]);
    await db.query(`insert into kz_external_stats(post_id,fetched_at,views,likes,comments,reposts) values
      ($1,'2026-11-02T10:00:00Z',10,1,0,0),($1,'2026-11-02T11:00:00Z',20,2,1,1)`, [external.id]);
    const combined = await analytics(org.id,range,true);
    assert.equal(Number(combined.tot.views),120);
    assert.equal(Number(combined.tot.posts),2);
    assert.deepEqual(combined.trend,[{day:'2026-11-02',views:120,likes:9,comments:3,reposts:2}]);
    assert.equal(Number(combined.byChannel.find(c => c.kind === 'vk')?.views), 20);
    assert.equal(Number((await analytics(org.id,{ ...range, kind:'carousel' },true)).tot.views),0);
    // Other workspaces and earlier snapshots must never leak into the totals.
    const { rows: [other] } = await db.query<{ id: string }>("insert into kz_orgs(name) values('Other') returning id");
    assert.equal(Number((await analytics(other.id,range,true)).tot.views),0);
    await db.query("update kz_publications set external_url='https://vk.com/wall-1_1' where org_id=$1", [org.id]);
    assert.equal(Number((await analytics(org.id,range,true)).tot.posts),1);

  } finally {
    state._pool = previousPool;
    await db.close();
  }
});
