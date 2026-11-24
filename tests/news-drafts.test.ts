import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createFromNews } from "../src/lib/monitor/news";

test("news creation persists queued drafts and the full source before starting AI generation", async () => {
  const db = await PGlite.create();
  const state = globalThis as typeof globalThis & { _pool?: unknown };
  const previous = state._pool;
  const query = (sql: string, params: unknown[] = []) => db.query(sql, params);
  try {
    await db.exec(await readFile(new URL("../db/adminer-schema.sql", import.meta.url), "utf8"));
    state._pool = { query, connect: async () => ({ query, release() {} }) };
    const { rows: [org] } = await db.query<{id:string}>("insert into kz_orgs(name) values('News test') returning id");
    const { rows: [brand] } = await db.query<{id:string}>("insert into kz_brands(org_id,name) values($1,'Brand') returning id", [org.id]);
    const { rows: [factory] } = await db.query<{id:string}>("insert into kz_factories(org_id,brand_id,name) values($1,$2,'Factory') returning id", [org.id,brand.id]);
    const { rows: [source] } = await db.query<{id:string}>("insert into kz_sources(org_id,kind,ref,title) values($1,'news','query','Search') returning id", [org.id]);
    const { rows: [news] } = await db.query<{id:string}>(`insert into kz_feed_items(org_id,source_id,ext_id,url,title,body,full_status,full_text)
      values($1,$2,'one','https://publisher.example/article','Source title','Short excerpt','article-v2','Full article with verified facts') returning id`, [org.id,source.id]);
    const result = await createFromNews(org.id, news.id, factory.id, ["post","article"], true, { draft: true, defer: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const {rows} = await db.query<{status:string;brand_id:string;meta: {draft:boolean;generationPending:boolean;source:{body:string;url:string}};recoverable:boolean}>(
      "select status,brand_id,meta,planned_for is not null recoverable from kz_content_items where id=any($1::uuid[])", [result.ids]);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.status, "approved");
      assert.equal(row.brand_id, brand.id);
      assert.equal(row.meta.draft, true);
      assert.equal(row.meta.generationPending, true);
      assert.equal(row.recoverable, true);
      assert.match(row.meta.source.body, /Full article with verified facts/);
      assert.equal(row.meta.source.url, "https://publisher.example/article");
    }
    assert.equal(Number((await db.query<{n:string}>("select count(*) n from kz_wallet_tx")).rows[0].n), 0);
  } finally {
    state._pool = previous;
    await db.close();
  }
});
