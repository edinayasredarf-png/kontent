import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { storeItems } from "../src/lib/monitor/store";
import { one, q } from "../src/lib/db";
import type { Item } from "../src/lib/monitor/parse";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
let org = "", source = "";
const post = (id: string, body = "Заголовок\n\nПервый абзац", photo = "photo.jpg"): Item => ({ extId: id, title: "Заголовок", body, url: `https://t.me/example_channel/${id}`, publishedAt: new Date("2026-11-02T10:00:00Z"), media: [{ type: "image", url: `https://example.org/${photo}` }] });

describe("batched news storage", { skip: !url && "нет TEST_DATABASE_URL" }, () => {
  before(async () => {
    org = (await one<{ id: string }>("insert into kz_orgs(name) values('monitor store test') returning id"))!.id;
    source = (await one<{ id: string }>("insert into kz_sources(org_id,kind,ref,title) values($1,'telegram','example_channel','Example') returning id", [org]))!.id;
  });
  after(async () => { if (org) await q("delete from kz_orgs where id=$1", [org]); });
  it("inserts a batch, deduplicates album entries and counts only new posts", async () => {
    assert.equal(await storeItems(org, source, [post("1"), post("2"), post("2")], true), 2);
    assert.equal(await storeItems(org, source, [post("1"), post("2")], true), 0);
  });
  it("repairs old text and expired photos without changing status or fetched timestamp", async () => {
    await q("update kz_feed_items set status='saved',fetched_at='2026-11-01T08:00:00Z' where org_id=$1 and ext_id='1'", [org]);
    assert.equal(await storeItems(org, source, [post("1", "Заголовок\n\nИсправленный текст", "fresh.jpg")], true), 0);
    const row = (await one<{ body: string; status: string; media: { url: string }[]; unchanged: boolean }>("select body,status,media,fetched_at='2026-11-01T08:00:00Z'::timestamptz unchanged from kz_feed_items where org_id=$1 and ext_id='1'", [org]))!;
    assert.equal(row.status, "saved"); assert.ok(row.unchanged);
    assert.equal(row.body, "Заголовок\n\nИсправленный текст");
    assert.equal(row.media[0].url, "https://example.org/fresh.jpg");
    await q("update kz_feed_items set status='used' where org_id=$1 and ext_id='2'", [org]);
    await storeItems(org, source, [post("2", "Обновлённый использованный пост")], true);
    assert.equal((await one<{ status: string }>("select status from kz_feed_items where org_id=$1 and ext_id='2'", [org]))!.status, "used");
  });
  it("leaves existing posts untouched for sources that do not request refresh", async () => {
    assert.equal(await storeItems(org, source, [post("1", "не перезаписывать")]), 0);
    assert.equal((await one<{ body: string }>("select body from kz_feed_items where org_id=$1 and ext_id='1'", [org]))!.body, "Заголовок\n\nИсправленный текст");
  });
  it("handles a complete 30-post poll in a single insert batch", async () => {
    assert.equal(await storeItems(org, source, Array.from({ length: 30 }, (_, i) => post(String(100 + i))), true), 30);
    assert.equal(await storeItems(org, source, []), 0);
  });
});
