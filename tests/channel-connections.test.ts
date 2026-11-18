import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { startConnection, finishVkConnection, connectionStatus, connectSelected } from "../src/lib/channel-connections";
import { handleTelegramConnect } from "../src/lib/telegram-connect";
import { vkChannelCredentials } from "../src/lib/vk-channel-token";
import { newLink as newMaxLink, handleUpdate as handleMaxUpdate } from "../src/lib/max-bot";
import { open, seal } from "../src/lib/crypto";

test("channel connections bind provider permissions to the correct user, organization, brand and factory", async t => {
  const db = await PGlite.create();
  const shared = globalThis as typeof globalThis & { _pool?: unknown }, previous = shared._pool;
  const environment = { ...process.env };
  let requestId = 0, tokenCalls = 0, botMayPost = true;
  const botMessages: Record<string, unknown>[] = [];
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const url = new URL(req.url!, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/oauth2/auth") {
      tokenCalls++;
      const body = new URLSearchParams(raw);
      if (body.get("grant_type") === "authorization_code") assert.ok(body.get("code_verifier"));
      return res.end(JSON.stringify({ access_token: "vk-private-token", refresh_token: "vk-private-refresh", expires_in: 3600 }));
    }
    if (url.pathname === "/method/groups.get") return res.end(JSON.stringify({ response: { count: 1, items: [{ id: 123, name: "Managed community", is_admin: 1, admin_level: 3 }] } }));
    if (url.pathname === "/method/photos.getWallUploadServer") return res.end(JSON.stringify({ response: { upload_url: "https://upload.example.test" } }));
    if (url.pathname === "/messages") return res.end(JSON.stringify({ message: { body: { mid: "1" } } }));
    const body = JSON.parse(raw || "{}") as Record<string, unknown>;
    if (url.pathname.endsWith("/getMe")) return res.end(JSON.stringify({ ok: true, result: { id: 900, username: "juicer_test_bot" } }));
    if (url.pathname.endsWith("/getChat")) return res.end(JSON.stringify({ ok: true, result: { type: "channel", title: "My Telegram channel" } }));
    if (url.pathname.endsWith("/getChatMember")) return res.end(JSON.stringify({ ok: true, result: { status: "administrator", can_post_messages: botMayPost } }));
    if (url.pathname.endsWith("/sendMessage")) {
      botMessages.push(body);
      const markup = body.reply_markup as { keyboard?: { request_chat: { request_id: number } }[][] };
      if (markup?.keyboard) requestId = markup.keyboard[0][0].request_chat.request_id;
      return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    }
    res.statusCode = 404; res.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, { APP_URL: "https://juicer.test", VK_CLIENT_ID: "54812872", VK_ID_BASE: base, VK_API_BASE: base, TELEGRAM_API_BASE: base, TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_BOT_USERNAME: "juicer_test_bot", TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret", MAX_BOT_TOKEN: "max-test", MAX_API_BASE: base });
  try {
    await db.exec(await readFile(new URL("../db/adminer-schema.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../db/038_channel_connections.sql", import.meta.url), "utf8"));
    const query = (sql: string, params: unknown[] = []) => db.query(sql, params);
    shared._pool = { query, connect: async () => ({ query, release() {} }) };
    const first = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows[0].id;
    const user = await first("insert into kz_users(email,name,password_hash) values('connect@test.ru','User','x') returning id");
    const otherUser = await first("insert into kz_users(email,name,password_hash) values('other@test.ru','Other','x') returning id");
    const org = await first("insert into kz_orgs(name) values('Org') returning id");
    const otherOrg = await first("insert into kz_orgs(name) values('Other org') returning id");
    const brand = await first("insert into kz_brands(org_id,name) values($1,'Brand') returning id", [org]);
    const otherBrand = await first("insert into kz_brands(org_id,name) values($1,'Other brand') returning id", [otherOrg]);
    const factory = await first("insert into kz_factories(org_id,brand_id,name) values($1,$2,'Factory') returning id", [org, brand]);
    await t.test("rejects a foreign brand and factory context before creating a connection", async () => {
      await assert.rejects(startConnection(org, user, otherBrand, "vk"), /Выберите бренд/);
      await assert.rejects(startConnection(otherOrg, user, otherBrand, "vk", factory), /Завод/);
    });
    await t.test("VK callback is one-use, account-bound, encrypted and selects only returned communities", async () => {
      const start = await startConnection(org, user, brand, "vk", factory), url = new URL(start.url), state = url.searchParams.get("state")!;
      assert.equal(url.searchParams.get("redirect_uri"), "https://juicer.test/api/channels/vk/callback");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      await assert.rejects(finishVkConnection(otherOrg, user, state, "code", "device"));
      await assert.rejects(finishVkConnection(org, otherUser, state, "code", "device"));
      assert.equal(tokenCalls, 0);
      await finishVkConnection(org, user, state, "code", "device");
      await assert.rejects(finishVkConnection(org, user, state, "code", "device"));
      assert.equal(tokenCalls, 1);
      assert.equal((await connectionStatus(otherOrg, user, start.id)).status, "expired");
      await assert.rejects(connectSelected(org, user, start.id, "999"), /из списка/);
      const result = await connectSelected(org, user, start.id, "123");
      assert.equal(result.factoryId, factory);
      const channel = (await db.query<{ id: string; credentials: unknown; brand_id: string }>("select id,credentials,brand_id from kz_channels where org_id=$1 and kind='vk'", [org])).rows[0];
      assert.equal(channel.brand_id, brand);
      assert.ok(!JSON.stringify(channel.credentials).includes("vk-private-token"));
      const factoryRow = (await db.query<{ channel_ids: string[] }>("select channel_ids from kz_factories where id=$1", [factory])).rows[0];
      assert.ok(factoryRow.channel_ids.includes(channel.id));
      await assert.rejects(connectSelected(org, user, start.id, "123"));
      const expired = { ...open(channel.credentials), expiresAt: "0" };
      await db.query("update kz_channels set credentials=$2 where id=$1", [channel.id, JSON.stringify(seal(expired))]);
      const refreshed = await vkChannelCredentials(org, channel.id, seal(expired));
      assert.equal(refreshed.token, "vk-private-token");
      assert.equal(tokenCalls, 2);
    });
    await t.test("reconnection renews the existing channel instead of duplicating it", async () => {
      const start = await startConnection(org, user, brand, "vk");
      await finishVkConnection(org, user, new URL(start.url).searchParams.get("state")!, "code", "device");
      await connectSelected(org, user, start.id, "123");
      const count = (await db.query<{ n: number }>("select count(*)::int n from kz_channels where org_id=$1 and kind='vk'", [org])).rows[0].n;
      assert.equal(count, 1);
    });
    await t.test("MAX deep link binds once and cannot be rebound by another messenger account", async () => {
      const link = await newMaxLink(org, user, brand);
      await handleMaxUpdate({ update_type: "bot_started", user: { user_id: 70 }, payload: link.code });
      await handleMaxUpdate({ update_type: "bot_started", user: { user_id: 71 }, payload: link.code });
      const row = (await db.query<{ status: string; max_user_id: string }>("select status,max_user_id::text from kz_max_links where org_id=$1", [org])).rows[0];
      assert.equal(row.status, "linked"); assert.equal(row.max_user_id, "70");
    });
    await t.test("Telegram authenticates the private sender and rechecks both administrator permissions", async () => {
      const start = await startConnection(org, user, brand, "telegram", factory), state = new URL(start.url).searchParams.get("start")!;
      await handleTelegramConnect({ message: { chat: { id: 50, type: "private" }, from: { id: 50 }, text: `/start ${state}` } });
      assert.ok(requestId > 0);
      await handleTelegramConnect({ message: { chat: { id: 51, type: "private" }, from: { id: 51 }, chat_shared: { request_id: requestId, chat_id: -1001 } } });
      assert.equal((await connectionStatus(org, user, start.id)).status, "pending");
      await handleTelegramConnect({ message: { chat: { id: 50, type: "private" }, from: { id: 50 }, chat_shared: { request_id: requestId, chat_id: -1001 } } });
      assert.equal((await connectionStatus(org, user, start.id)).status, "ready");
      botMayPost = false;
      await assert.rejects(connectSelected(org, user, start.id, "-1001"), /нет права/);
      botMayPost = true;
      await connectSelected(org, user, start.id, "-1001");
      const channel = (await db.query<{ credentials: unknown }>("select credentials from kz_channels where org_id=$1 and kind='telegram'", [org])).rows[0];
      assert.deepEqual(open(channel.credentials), { shared: "1", target: "-1001" });
      assert.ok(!JSON.stringify(channel.credentials).includes("test-token"));
      assert.equal((await connectionStatus(org, user, start.id)).status, "used");
      assert.ok(botMessages.length >= 2);
    });
  } finally {
    shared._pool = previous;
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
    server.closeAllConnections(); server.close(); await db.close();
  }
});
