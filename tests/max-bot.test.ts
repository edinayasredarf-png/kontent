import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";

/** Нужна БД: TEST_DATABASE_URL с применённой db/adminer-schema.sql (временная, не боевая). Реальных запросов к MAX тесты не делают. */
const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && "нет TEST_DATABASE_URL";

type Hit = { method: string; path: string; auth?: string; body: unknown };
const hits: Hit[] = [];
let admins: Record<string, number[]> = {};
let titles: Record<string, string> = {};
let srv: http.Server;
let bot: typeof import("../src/lib/max-bot");
let db: typeof import("../src/lib/db");
let orgA = "", orgB = "", userA = "", userB = "", brandA = "", brandB = "";

before(async () => {
  if (!URL_) return;
  srv = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const u = new URL(req.url!, "http://x");
      let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* пусто */ }
      hits.push({ method: req.method!, path: u.pathname + u.search, auth: req.headers.authorization, body });
      res.setHeader("Content-Type", "application/json");
      const m = u.pathname.match(/^\/chats\/(-?\d+)(\/members\/admins)?$/);
      if (m && m[2]) { const a = admins[m[1]]; if (!a) { res.statusCode = 403; return res.end(JSON.stringify({ code: "access.denied", message: "no access" })); } return res.end(JSON.stringify({ members: a.map((id) => ({ user_id: id, is_admin: true })) })); }
      if (m) return res.end(JSON.stringify({ title: titles[m[1]] ?? "" }));
      if (u.pathname === "/messages") return res.end(JSON.stringify({ message: { body: { mid: "m1" } } }));
      res.end("{}");
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  process.env.MAX_API_BASE = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.MAX_BOT_TOKEN = "PLATFORM-BOT-TOKEN";
  process.env.MAX_WEBHOOK_SECRET = "hook-secret-123";
  process.env.DATABASE_URL = URL_; process.env.AUTH_SECRET = "test-secret";
  db = await import("../src/lib/db");
  bot = await import("../src/lib/max-bot");
  await db.q("delete from kz_orgs where name like 'max-test-%'"); await db.q("delete from kz_users where email like 'max-test-%'"); await db.q("delete from kz_max_chats");
  for (const k of ["A", "B"]) {
    const u = await db.one<{ id: string }>("insert into kz_users(email,name,password_hash) values($1,$2,'x') returning id", [`max-test-${k}@t.ru`, k]);
    const o = await db.one<{ id: string }>("insert into kz_orgs(name) values($1) returning id", [`max-test-${k}`]);
    await db.q("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [o!.id, u!.id]);
    const b = await db.one<{ id: string }>("insert into kz_brands(org_id,name) values($1,'Б') returning id", [o!.id]);
    if (k === "A") { userA = u!.id; orgA = o!.id; brandA = b!.id; } else { userB = u!.id; orgB = o!.id; brandB = b!.id; }
  }
});
after(async () => { if (!URL_) return; await db.q("delete from kz_orgs where name like 'max-test-%'"); await db.q("delete from kz_users where email like 'max-test-%'"); await db.q("delete from kz_max_chats"); srv.closeAllConnections?.(); srv.close(); });
beforeEach(async () => { hits.length = 0; admins = {}; titles = {}; if (URL_) { await db.q("delete from kz_max_chats"); await db.q("delete from kz_channels where org_id in ($1,$2)", [orgA, orgB]); await db.q("delete from kz_max_links"); } });

const plain = (c: string) => c.replace("-", "");
const dm = (user: number, text: string) => ({ update_type: "message_created", message: { sender: { user_id: user, is_bot: false }, recipient: { chat_type: "dialog", user_id: 1 }, body: { text } } });
const botAdded = (chat: number, by: number) => ({ update_type: "bot_added", chat_id: chat, user: { user_id: by }, is_channel: true });
const replies = () => hits.filter((h) => h.method === "POST" && h.path.startsWith("/messages"));

describe("MAX: бот сервиса", { skip }, () => {
  it("ключ: 8 знаков без похожих символов, привязан к бренду, старый ключ пользователя гасится", async () => {
    const a = await bot.newLink(orgA, userA, brandA);
    assert.match(a.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const b = await bot.newLink(orgA, userA, brandA);
    assert.equal((await db.q("select 1 from kz_max_links where org_id=$1", [orgA])).length, 1);
    assert.notEqual(a.code, b.code);
    await assert.rejects(bot.newLink(orgA, userA, brandB), /бренд/i); // чужой бренд
  });
  it("бот добавлен в канал → канал запоминается с названием и тем, кто добавил; удалён → неактивен", async () => {
    titles["500"] = "Мой канал";
    await bot.handleUpdate(botAdded(500, 42));
    const r = await db.one<{ title: string; added_by: string; active: boolean }>("select title,added_by,active from kz_max_chats where chat_id=500");
    assert.deepEqual([r!.title, r!.added_by, r!.active], ["Мой канал", "42", true]);
    await bot.handleUpdate({ update_type: "bot_removed", chat_id: 500 });
    assert.equal((await db.one<{ active: boolean }>("select active from kz_max_chats where chat_id=500"))!.active, false);
  });
  it("ключ в личных сообщениях привязывает MAX-аккаунт; бот отвечает пользователю", async () => {
    const { code } = await bot.newLink(orgA, userA, brandA);
    await bot.handleUpdate(dm(42, code));
    const l = await db.one<{ status: string; max_user_id: string }>("select status,max_user_id from kz_max_links where org_id=$1", [orgA]);
    assert.deepEqual([l!.status, l!.max_user_id], ["linked", "42"]);
    const rep = replies()[0];
    assert.equal(rep.auth, "PLATFORM-BOT-TOKEN");
    assert.match(rep.path, /user_id=42/);
    assert.match(String((rep.body as { text: string }).text), /Ключ принят/);
  });
  it("ключ в группе/канале не принимается (только личная переписка), чужой текст — подсказка", async () => {
    const { code } = await bot.newLink(orgA, userA, brandA);
    await bot.handleUpdate({ update_type: "message_created", message: { sender: { user_id: 42 }, recipient: { chat_type: "chat", chat_id: 9 }, body: { text: code } } });
    assert.equal((await db.one<{ status: string }>("select status from kz_max_links where org_id=$1", [orgA]))!.status, "pending");
    hits.length = 0;
    await bot.handleUpdate(dm(42, "привет"));
    assert.match(String((replies()[0].body as { text: string }).text), /Чтобы подключить канал/);
  });
  it("неверный и просроченный ключ отклоняются", async () => {
    const { code } = await bot.newLink(orgA, userA, brandA);
    await bot.handleUpdate(dm(42, "AAAA-BBBB"));
    assert.equal((await db.one<{ status: string }>("select status from kz_max_links where org_id=$1", [orgA]))!.status, "pending");
    await db.q("update kz_max_links set expires_at=now() - interval '1 minute'");
    hits.length = 0;
    await bot.handleUpdate(dm(42, code));
    assert.equal((await db.one<{ status: string }>("select status from kz_max_links where org_id=$1", [orgA]))!.status, "pending");
    assert.match(String((replies()[0].body as { text: string }).text), /не найден или истёк/);
    assert.equal((await bot.linkStatus(orgA, userA, code)).status, "expired");
  });
});

describe("MAX: выбор и подключение канала", { skip }, () => {
  const ready = async (maxUser = 42) => {
    const { code } = await bot.newLink(orgA, userA, brandA);
    await bot.handleUpdate(dm(maxUser, code));
    return code;
  };
  it("в списке только каналы, где этот аккаунт — администратор", async () => {
    titles = { "1": "Мой", "2": "Чужой" };
    await bot.handleUpdate(botAdded(1, 42)); await bot.handleUpdate(botAdded(2, 99));
    admins = { "1": [42, 7], "2": [99] };
    const code = await ready();
    const st = await bot.linkStatus(orgA, userA, code);
    assert.equal(st.status, "linked");
    assert.deepEqual(st.chats!.map((c) => c.id), ["1"]);
  });
  it("подключение создаёт канал MAX с общим ботом: токена в БД нет", async () => {
    titles = { "1": "Мой" }; await bot.handleUpdate(botAdded(1, 42)); admins = { "1": [42] };
    const code = await ready();
    const r = await bot.connectChat(orgA, userA, code, "1");
    assert.equal(r.ok, true);
    const ch = await db.one<{ kind: string; title: string; credentials: unknown; brand_id: string }>("select kind,title,credentials,brand_id from kz_channels where org_id=$1", [orgA]);
    assert.deepEqual([ch!.kind, ch!.title, ch!.brand_id], ["max", "Мой", brandA]);
    assert.ok(!JSON.stringify(ch!.credentials).includes("PLATFORM"));
    const { open } = await import("../src/lib/crypto");
    assert.deepEqual(open(ch!.credentials), { target: "1", shared: "1" });
    assert.equal((await db.one<{ status: string }>("select status from kz_max_links where org_id=$1", [orgA]))!.status, "used");
    // повторно тем же ключом нельзя
    assert.equal((await bot.connectChat(orgA, userA, code, "1")).ok, false);
  });
  it("не администратор канала подключить его не может, даже зная id", async () => {
    await bot.handleUpdate(botAdded(1, 99)); admins = { "1": [99] };
    const code = await ready(42);
    const r = await bot.connectChat(orgA, userA, code, "1");
    assert.equal(r.ok, false); assert.match((r as { error: string }).error, /не администратор/);
    assert.equal((await db.q("select 1 from kz_channels where org_id=$1", [orgA])).length, 0);
  });
  it("бот не администратор канала (MAX не отдаёт список) — понятная ошибка", async () => {
    await bot.handleUpdate(botAdded(1, 42)); admins = {};
    const code = await ready();
    const r = await bot.connectChat(orgA, userA, code, "1");
    assert.equal(r.ok, false); assert.match((r as { error: string }).error, /администратором/);
  });
  it("изоляция: чужая организация не может использовать ключ другой", async () => {
    await bot.handleUpdate(botAdded(1, 42)); admins = { "1": [42] };
    const code = await ready();
    const r = await bot.connectChat(orgB, userB, code, "1");
    assert.equal(r.ok, false);
    assert.equal((await bot.linkStatus(orgB, userB, code)).status, "expired");
    assert.equal((await db.q("select 1 from kz_channels where org_id=$1", [orgB])).length, 0);
  });
  it("дубль канала в организации отклоняется; бот не добавлен в канал — отказ", async () => {
    await bot.handleUpdate(botAdded(1, 42)); admins = { "1": [42] };
    await bot.connectChat(orgA, userA, await ready(), "1");
    const again = await bot.connectChat(orgA, userA, await ready(), "1");
    assert.equal(again.ok, false); assert.match((again as { error: string }).error, /уже подключён/);
    assert.equal((await bot.connectChat(orgA, userA, await ready(), "777")).ok, false);
    assert.equal((await bot.connectChat(orgA, userA, await ready(), "abc")).ok, false);
  });
});

describe("MAX: вебхук и публикация", { skip }, () => {
  const call = async (secret: string | null, body: unknown) => {
    const { POST } = await import("../src/app/api/max/webhook/route");
    return POST(new NextRequest("http://localhost/api/max/webhook", { method: "POST", headers: secret === null ? {} : { "x-max-bot-api-secret": secret }, body: JSON.stringify(body) }));
  };
  it("запрос без секрета или с чужим секретом отклоняется, с верным — принимается", async () => {
    assert.equal((await call(null, botAdded(5, 1))).status, 403);
    assert.equal((await call("wrong-secret-xx", botAdded(5, 1))).status, 403);
    assert.equal((await db.q("select 1 from kz_max_chats")).length, 0);
    assert.equal((await call("hook-secret-123", botAdded(5, 1))).status, 200);
    assert.equal((await db.q("select 1 from kz_max_chats where chat_id=5")).length, 1);
  });
  it("битое тело не роняет вебхук (MAX не будет слать повторно)", async () => {
    const { POST } = await import("../src/app/api/max/webhook/route");
    const r = await POST(new NextRequest("http://localhost/api/max/webhook", { method: "POST", headers: { "x-max-bot-api-secret": "hook-secret-123" }, body: "{oops" }));
    assert.equal(r.status, 200);
  });
  it("публикация в канал общего бота идёт с токеном платформы из окружения", async () => {
    const { max } = await import("../src/lib/publishing/max");
    const r = await max.publish({ text: "Привет" }, { target: "1", shared: "1" });
    assert.ok(r.externalId);
    const h = hits.find((x) => x.path.startsWith("/messages"))!;
    assert.equal(h.auth, "PLATFORM-BOT-TOKEN"); assert.match(h.path, /chat_id=1/);
  });
  it("без MAX_BOT_TOKEN публикация в такой канал даёт понятную ошибку, без обращения к MAX", async () => {
    const { max } = await import("../src/lib/publishing/max");
    const t = process.env.MAX_BOT_TOKEN; delete process.env.MAX_BOT_TOKEN;
    await assert.rejects(max.publish({ text: "x" }, { target: "1", shared: "1" }), /не настроен на сервере/);
    process.env.MAX_BOT_TOKEN = t; assert.equal(hits.length, 0);
  });
  it("подписка: адрес, секрет и типы событий уходят в MAX", async () => {
    process.env.APP_URL = "https://app.example";
    const url = await bot.subscribe();
    assert.equal(url, "https://app.example/api/max/webhook");
    const h = hits.find((x) => x.path === "/subscriptions")!;
    assert.equal((h.body as { secret: string }).secret, "hook-secret-123");
    assert.ok((h.body as { update_types: string[] }).update_types.includes("bot_added"));
  });
});

describe("MAX: ключ без БД", () => {
  it("normCode-подобное: ключ принимается с дефисом, пробелами и в любом регистре", () => { assert.equal(plain("ABCD-EFGH"), "ABCDEFGH"); });
});
