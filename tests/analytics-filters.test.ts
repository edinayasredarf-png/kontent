import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

/** Период и фильтры аналитики. SQL-часть нужна БД: TEST_DATABASE_URL с применённой db/adminer-schema.sql. */
const URL_ = process.env.TEST_DATABASE_URL;
const skipDb = !URL_ && "нет TEST_DATABASE_URL";

describe("период", () => {
  it("быстрые периоды считаются по календарным дням Москвы", async () => {
    const { parseRange, todayMsk } = await import("../src/lib/range");
    const all = ["today", "yesterday", "tomorrow", "7", "30", "all", "custom"] as never[];
    const t = todayMsk();
    assert.deepEqual(parseRange({ r: "today" }, all, "30"), { r: "today", from: t, to: t });
    const y = parseRange({ r: "yesterday" }, all, "30"), tm = parseRange({ r: "tomorrow" }, all, "30");
    assert.equal((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${y.from}T00:00:00Z`)) / 86_400_000, 1);
    assert.equal((Date.parse(`${tm.from}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86_400_000, 1);
    const w = parseRange({ r: "7" }, all, "30");
    assert.equal((Date.parse(`${w.to}T00:00:00Z`) - Date.parse(`${w.from}T00:00:00Z`)) / 86_400_000, 6);
    assert.deepEqual(parseRange({ r: "all" }, all, "30"), { r: "all", from: "", to: "" });
  });
  it("старый параметр d работает, лишнее и мусор отбрасываются", async () => {
    const { parseRange } = await import("../src/lib/range");
    assert.equal(parseRange({ d: "7" }, ["7", "30", "all"] as never[], "30").r, "7");
    assert.equal(parseRange({ r: "tomorrow" }, ["7", "30"] as never[], "30").r, "30", "недопустимый период → по умолчанию");
    const c = parseRange({ r: "custom", from: "2026-10-10", to: "2026-10-01" }, ["custom"] as never[], "custom");
    assert.deepEqual([c.from, c.to], ["2026-10-01", "2026-10-10"], "перепутанные даты меняются местами");
    const bad = parseRange({ r: "custom", from: "'; drop", to: "2026-13-45" }, ["custom"] as never[], "custom");
    assert.deepEqual([bad.from, bad.to], ["", ""]);
  });
  it("границы дня — московская полночь", async () => {
    const { bounds } = await import("../src/lib/range");
    const b = bounds({ from: "2026-10-05", to: "2026-10-05" });
    assert.equal(b.from, "2026-10-04T21:00:00.000Z");
    assert.equal(b.to, "2026-10-05T21:00:00.000Z");
  });
});

describe("аналитика с фильтрами", { skip: skipDb }, () => {
  let db: typeof import("../src/lib/db"), eng: typeof import("../src/lib/engage");
  const ids: Record<string, string> = {};
  before(async () => {
    process.env.DATABASE_URL = URL_;
    db = await import("../src/lib/db"); eng = await import("../src/lib/engage");
    const org = (await db.one<{ id: string }>("insert into kz_orgs(name) values('an-test') returning id"))!.id; ids.org = org;
    const b1 = (await db.one<{ id: string }>("insert into kz_brands(org_id,name) values($1,'A') returning id", [org]))!.id;
    const b2 = (await db.one<{ id: string }>("insert into kz_brands(org_id,name) values($1,'B') returning id", [org]))!.id;
    ids.b1 = b1; ids.b2 = b2;
    const ch = (await db.one<{ id: string }>("insert into kz_channels(org_id,brand_id,kind,title,status) values($1,$2,'telegram','Т','active') returning id", [org, b1]))!.id; ids.ch = ch;
    const mk = async (brand: string, kind: string, when: string, views: number) => {
      const it = (await db.one<{ id: string }>("insert into kz_content_items(org_id,brand_id,kind,topic,status) values($1,$2,$3,'t','published') returning id", [org, brand, kind]))!.id;
      const p = (await db.one<{ id: string }>("insert into kz_publications(org_id,item_id,channel_id,status,published_at) values($1,$2,$3,'published',$4::timestamptz) returning id", [org, it, ch, when]))!.id;
      await db.q("insert into kz_post_stats(publication_id,org_id,views) values($1,$2,$3)", [p, org, views]);
    };
    await mk(b1, "post", "2026-10-05T10:00:00+03:00", 100);
    await mk(b1, "carousel", "2026-10-06T00:30:00+03:00", 50);
    await mk(b2, "post", "2026-10-06T12:00:00+03:00", 7);
  });
  after(async () => { if (ids.org) await db.q("delete from kz_orgs where id=$1", [ids.org]); });
  const posts = async (f: import("../src/lib/engage").AFilter) => { const a = await eng.analytics(ids.org, f); return [Number(a.tot.posts), Number(a.tot.views)]; };
  it("без фильтров считает всё", async () => assert.deepEqual(await posts({}), [3, 157]));
  it("день по Москве: пост в 00:30 относится к 6 октября, а не к 5-му", async () => {
    assert.deepEqual(await posts({ from: "2026-10-05", to: "2026-10-05" }), [1, 100]);
    assert.deepEqual(await posts({ from: "2026-10-06", to: "2026-10-06" }), [2, 57]);
  });
  it("бренд, канал, формат и открытые границы", async () => {
    assert.deepEqual(await posts({ brand: ids.b2 }), [1, 7]);
    assert.deepEqual(await posts({ kind: "post" }), [2, 107]);
    assert.deepEqual(await posts({ channel: ids.ch, from: "2026-10-06" }), [2, 57]);
    assert.deepEqual(await posts({ to: "2026-10-05" }), [1, 100]);
    assert.deepEqual(await posts({ from: "2027-01-01" }), [0, 0]);
  });
});
