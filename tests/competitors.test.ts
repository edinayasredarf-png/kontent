import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

/** Конкуренты: сайт как источник и понятная ошибка VK. БД нужна только части тестов: TEST_DATABASE_URL с применённой db/adminer-schema.sql. */
const URL_ = process.env.TEST_DATABASE_URL;
const skipDb = !URL_ && "нет TEST_DATABASE_URL";
let srv: http.Server, base = "";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Конкурент</title>
<item><title>Новый тариф запущен</title><link>BASE/a</link><description>Описание тарифа и условий.</description><pubDate>Mon, 20 Oct 2026 10:00:00 +0300</pubDate></item>
<item><title>Итоги квартала</title><link>BASE/b</link><description>Цифры и выводы.</description><pubDate>Tue, 21 Oct 2026 10:00:00 +0300</pubDate></item></channel></rss>`;

before(async () => {
  process.env.ALLOW_PRIVATE_FETCH = "1";
  srv = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    if (u.pathname === "/method/wall.get" || u.pathname === "/method/groups.getById") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: { error_code: 27, error_msg: "Group authorization failed: method is unavailable with group auth." } })); }
    if (u.pathname === "/feed") { res.setHeader("Content-Type", "application/rss+xml"); return res.end(RSS.replaceAll("BASE", base)); }
    if (u.pathname === "/blog") { res.setHeader("Content-Type", "text/html"); return res.end(`<html><head><title>Блог конкурента</title><link rel="alternate" type="application/rss+xml" href="/feed"></head><body></body></html>`); }
    res.statusCode = 404; res.end("no");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.VK_API_BASE = base; process.env.VK_SERVICE_TOKEN = "group-token";
});
after(() => { srv.close(); });

describe("адрес сайта и ошибки VK", () => {
  it("адрес сайта приводится к единому виду, мусор отклоняется", async () => {
    const { normalizeRef } = await import("../src/lib/competitors");
    assert.equal(normalizeRef("site", "Example.RU/blog/"), "https://example.ru/blog");
    assert.equal(normalizeRef("site", "http://a.ru/news?x=1#top"), "http://a.ru/news?x=1");
    assert.throws(() => normalizeRef("site", "javascript:alert(1)"));
    assert.throws(() => normalizeRef("site", "localhost"));
    assert.throws(() => normalizeRef("site", "https://user:pw@a.ru"));
  });
  it("код 27 объясняется по-русски, без технического «Group authorization failed»", async () => {
    const { vkServiceError } = await import("../src/lib/vk-service");
    const t = vkServiceError(27, "Group authorization failed");
    assert.match(t, /сервисный ключ/i); assert.doesNotMatch(t, /Group authorization/);
    assert.match(vkServiceError(100, "x"), /не найдено/);
  });
  it("при коде 27 конкурент из VK не добавляется, а текст ошибки понятный", async () => {
    const { fetchCompetitor } = await import("../src/lib/competitors");
    await assert.rejects(fetchCompetitor("vk", "datumgroup"), /сервисный ключ/i);
  });
  it("сайт с лентой RSS читается как источник материалов", async () => {
    const { fetchCompetitor } = await import("../src/lib/competitors");
    const f = await fetchCompetitor("site", `${base}/blog`);
    assert.equal(f.title, "Блог конкурента");
    assert.equal(f.members, null);
    assert.deepEqual(f.posts.map((p) => p.url).sort(), [`${base}/a`, `${base}/b`]);
    assert.ok(f.posts.every((p) => p.views === 0 && p.body.length > 5));
  });
  it("страница без ленты и заголовков даёт понятную ошибку", async () => {
    const { fetchCompetitor } = await import("../src/lib/competitors");
    await assert.rejects(fetchCompetitor("site", `${base}/nothing`));
  });
});

describe("сайт в базе", { skip: skipDb }, () => {
  let orgId = "";
  before(async () => {
    process.env.DATABASE_URL = URL_;
    const db = await import("../src/lib/db");
    orgId = (await db.one<{ id: string }>("insert into kz_orgs(name) values('comp-test') returning id"))!.id;
  });
  after(async () => { const db = await import("../src/lib/db"); await db.q("delete from kz_orgs where id=$1", [orgId]); });
  it("конкурент с несколькими площадками: добавление, повтор, итоги, удаление группы", async () => {
    const { addCompetitor, addPlatform, groupSummaries, groupPosts } = await import("../src/lib/competitors");
    const db = await import("../src/lib/db");
    const r = await addCompetitor(orgId, null, "site", `${base}/blog`, "Мой конкурент");
    assert.ok(r.ok); if (!r.ok) return;
    assert.equal((await addPlatform(orgId, r.id, "site", `${base}/blog/`)).ok, false, "та же площадка повторно");
    const vkTry = await addPlatform(orgId, r.id, "vk", "datumgroup");
    assert.equal(vkTry.ok, false, "VK с ключом сообщества не добавляется");
    const sum = (await groupSummaries(orgId)).find((g) => g.id === r.id)!;
    assert.equal(sum.name, "Мой конкурент"); assert.equal(sum.platforms.length, 1); assert.equal(sum.members, null);
    assert.equal(sum.posts30 >= 0, true);
    const all = await groupPosts(orgId, r.id, { platform: "", from: null, to: null, sort: "date", q: "", limit: 20 });
    assert.equal(all.rows.length, 2);
    assert.equal((await groupPosts(orgId, r.id, { platform: "", from: null, to: null, sort: "date", q: "ЦИФРЫ", limit: 20 })).rows.length, 1, "поиск без учёта регистра");
    assert.equal((await groupPosts(orgId, r.id, { platform: "", from: null, to: null, sort: "date", q: "", limit: 1 })).more, true);
    const none = await addCompetitor(orgId, null, "vk", "datumgroup", "Только VK");
    assert.equal(none.ok, false);
    assert.equal(Number((await db.one<{ n: string }>("select count(*) n from kz_competitor_groups where org_id=$1", [orgId]))!.n), 1, "группа при неудаче не остаётся");
    await db.q("delete from kz_competitor_groups where id=$1", [r.id]);
    assert.equal(Number((await db.one<{ n: string }>("select count(*) n from kz_competitors where org_id=$1", [orgId]))!.n), 0, "площадки удаляются вместе с группой");
  });
});
