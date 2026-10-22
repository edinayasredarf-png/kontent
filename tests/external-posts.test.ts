import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

/** Материалы по ссылке: разбор адресов, чтение Telegram и VK, снимки показателей. БД нужна части тестов (TEST_DATABASE_URL). */
const URL_ = process.env.TEST_DATABASE_URL;
const skipDb = !URL_ && "нет TEST_DATABASE_URL";
let srv: http.Server, base = "", views = 1000;

const TG = () => `<html><body><div class="tgme_widget_message_wrap"><div class="tgme_widget_message_owner_name"><span>Канал Дня</span></div>
<div class="tgme_widget_message_text">Новый сервис для города запущен.<br/>Подробности внутри</div>
<div class="tgme_widget_message_info"><span class="tgme_widget_message_views">${views >= 1000 ? (views / 1000).toFixed(1) + "K" : views}</span><a class="tgme_widget_message_date" href="x"><time datetime="2026-10-20T09:30:00+00:00"></time></a></div>
<div class="tgme_widget_message_reactions"><span class="tgme_reaction">👍 12</span><span class="tgme_reaction">🔥 3</span></div></div></body></html>`;

before(async () => {
  process.env.ALLOW_PRIVATE_FETCH = "1";
  srv = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    const json = (o: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    if (/^\/[A-Za-z0-9_]+\/\d+$/.test(u.pathname) && u.searchParams.get("embed")) { if (u.pathname.startsWith("/gone/")) return res.end("<html></html>"); res.setHeader("Content-Type", "text/html"); return res.end(TG()); }
    if (u.pathname === "/messages") return json({ messages: [{ timestamp: 1792000000000, url: "https://max.ru/c/777/AbCdEfGh", stat: { views: 321 }, body: { mid: "mid.AbCdEfGh", text: "Пост MAX про сервис" } }, { timestamp: 1791990000000, url: "https://max.ru/c/777/Other", stat: { views: 5 }, body: { mid: "mid.Other", text: "другой" } }] });
    if (u.pathname === "/method/wall.getById") return json({ response: { items: [{ id: 456, owner_id: -123, date: 1792000000, text: "Пост про [club1|Сообщество] и сервис", views: { count: views }, likes: { count: 40 }, comments: { count: 5 }, reposts: { count: 7 } }], groups: [{ id: 123, name: "АИС Единая среда" }] } });
    res.statusCode = 404; res.end("no");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.TG_WEB_BASE = base; process.env.VK_API_BASE = base; process.env.VK_SERVICE_TOKEN = "svc"; process.env.MAX_API_BASE = base;
});
after(() => { srv.close(); });

describe("разбор ссылок", () => {
  it("Telegram, VK и MAX распознаются, лишнее отклоняется", async () => {
    const { parsePostLink } = await import("../src/lib/external-posts");
    assert.deepEqual(parsePostLink("https://t.me/Durov/123"), { kind: "telegram", ref: "durov/123", user: "Durov", id: "123" });
    assert.equal(parsePostLink("t.me/s/channel_name/55").ref, "channel_name/55");
    assert.deepEqual(parsePostLink("https://vk.com/wall-123_456"), { kind: "vk", ref: "-123_456", owner: "-123", id: "456" });
    assert.equal(parsePostLink("https://m.vk.ru/public123?w=wall-123_456").ref, "-123_456");
    assert.equal(parsePostLink("https://max.ru/channel/abc123?x=1#y").kind, "max");
    assert.throws(() => parsePostLink("https://t.me/c/123/4"), /закрыт/);
    assert.throws(() => parsePostLink("https://t.me/durov"), /конкретный пост/);
    assert.throws(() => parsePostLink("https://vk.com/durov"), /vk\.com\/wall/);
    assert.throws(() => parsePostLink("https://example.com/post/1"), /VK, Telegram и MAX/);
    assert.throws(() => parsePostLink(""), /Вставьте ссылку/);
  });
  it("страница Telegram: просмотры, текст, дата, реакции", async () => {
    const { parseTgEmbed } = await import("../src/lib/external-posts");
    const x = parseTgEmbed(TG());
    assert.equal(x.views, 1000); assert.equal(x.author, "Канал Дня"); assert.equal(x.reactions, 15);
    assert.match(x.body, /Новый сервис для города запущен\./); assert.equal(x.at?.toISOString(), "2026-10-20T09:30:00.000Z");
  });
});

describe("чтение постов", () => {
  it("Telegram: показатели и текст; удалённый пост даёт понятную ошибку", async () => {
    const { fetchExternal, parsePostLink } = await import("../src/lib/external-posts");
    const f = await fetchExternal("00000000-0000-0000-0000-000000000000", parsePostLink("https://t.me/chan_nel/9"));
    assert.equal(f.metrics.views, 1000); assert.equal(f.metrics.likes, 15);
    await assert.rejects(fetchExternal("x", parsePostLink("https://t.me/gone/9")), /не найден/);
  });
  it("VK: просмотры, лайки, комментарии, репосты, название сообщества, упоминание очищено", async () => {
    const dbOff = !URL_;
    if (dbOff) return; // выбор ключа сообщества идёт через БД
    process.env.DATABASE_URL = URL_;
    const { fetchExternal, parsePostLink } = await import("../src/lib/external-posts");
    const db = await import("../src/lib/db");
    const org = (await db.one<{ id: string }>("insert into kz_orgs(name) values('ext-vk') returning id"))!.id;
    try {
      const f = await fetchExternal(org, parsePostLink("https://vk.com/wall-123_456"));
      assert.deepEqual([f.metrics.views, f.metrics.likes, f.metrics.comments, f.metrics.reposts], [1000, 40, 5, 7]);
      assert.equal(f.author, "АИС Единая среда"); assert.equal(f.body, "Пост про Сообщество и сервис");
    } finally { await db.q("delete from kz_orgs where id=$1", [org]); }
  });
});

describe("в базе", { skip: skipDb }, () => {
  let org = "";
  before(async () => { process.env.DATABASE_URL = URL_; const db = await import("../src/lib/db"); org = (await db.one<{ id: string }>("insert into kz_orgs(name) values('ext-test') returning id"))!.id; });
  after(async () => { const db = await import("../src/lib/db"); await db.q("delete from kz_orgs where id=$1", [org]); });
  it("добавление, повтор, обновление дописывает снимок, список считает прирост", async () => {
    const { addExternalPost, refreshExternal, listExternal, externalHistory } = await import("../src/lib/external-posts");
    const db = await import("../src/lib/db");
    views = 1000;
    const a = await addExternalPost(org, null, "https://t.me/chan_nel/9");
    assert.ok(a.ok); if (!a.ok) return;
    const dup = await addExternalPost(org, null, "t.me/CHAN_NEL/9");
    assert.deepEqual(dup, { ok: false, error: "Этот пост уже добавлен" });
    // старый снимок и новый: прирост за сутки считается от снимка суточной давности
    await db.q("update kz_external_stats set fetched_at = now() - interval '26 hours' where post_id=$1", [a.id]);
    views = 1600;
    assert.deepEqual(await refreshExternal(a.id), { ok: true });
    const list = await listExternal(org, {});
    assert.equal(list.length, 1); assert.equal(list[0].views, 1600); assert.equal(list[0].d24, 600); assert.equal(list[0].author, "Канал Дня");
    assert.equal((await externalHistory(org, a.id)).length, 2);
    // ошибка обновления сохраняется у поста и не стирает данные
    await db.q("update kz_external_posts set ext_ref='gone/9', url='https://t.me/gone/9' where id=$1", [a.id]);
    const bad = await refreshExternal(a.id); assert.equal(bad.ok, false);
    const after = (await listExternal(org, {}))[0]; assert.equal(after.views, 1600); assert.match(after.last_error ?? "", /не найден/);
  });
  it("MAX: пост находится среди сообщений подключённого канала; без канала — понятная подсказка", async () => {
    const { addExternalPost } = await import("../src/lib/external-posts");
    const db = await import("../src/lib/db");
    const { seal } = await import("../src/lib/crypto");
    const none = await addExternalPost(org, null, "https://max.ru/c/777/AbCdEfGh");
    assert.equal(none.ok, false); assert.match(none.ok ? "" : none.error, /подключите канал/);
    await db.q("insert into kz_channels(org_id,brand_id,kind,title,credentials) select $1,id,'max','MAX канал',$2::jsonb from kz_brands where org_id=$1 limit 1", [org, "{}"]).catch(() => null);
    const brand = (await db.one<{ id: string }>("insert into kz_brands(org_id,name) values($1,'Б') returning id", [org]))!.id;
    await db.q("insert into kz_channels(org_id,brand_id,kind,title,credentials) values($1,$2,'max','MAX канал',$3::jsonb)", [org, brand, JSON.stringify(seal({ token: "t", target: "777" }))]);
    const ok = await addExternalPost(org, null, "https://max.ru/c/777/AbCdEfGh");
    assert.ok(ok.ok);
    const row = await db.one<{ views: number; body: string }>("select s.views,p.body from kz_external_posts p join kz_external_stats s on s.post_id=p.id where p.id=$1", [(ok as { id: string }).id]);
    assert.equal(row!.views, 321); assert.equal(row!.body, "Пост MAX про сервис");
    const miss = await addExternalPost(org, null, "https://max.ru/c/777/Missing");
    assert.equal(miss.ok, false); assert.match(miss.ok ? "" : miss.error, /не найден/);
  });
  it("фильтр по периоду и бренду; чужая организация ничего не видит", async () => {
    const { listExternal } = await import("../src/lib/external-posts");
    assert.equal((await listExternal(org, { from: "2999-01-01T00:00:00Z" })).length, 0);
    assert.equal((await listExternal("00000000-0000-0000-0000-000000000000", {})).length, 0);
  });
});
