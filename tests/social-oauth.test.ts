import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { open, seal } from "../src/lib/crypto";
import { startConnection, finishSocialConnection, connectSelected, connectionStatus } from "../src/lib/channel-connections";
import { socialAppConfig, socialRedirectUri } from "../src/lib/social-oauth-config";
import { SOCIAL_PROVIDERS } from "../src/lib/social-oauth-catalog";
import { socialAuthorizeUrl, exchangeSocialCode, socialOptions } from "../src/lib/social-oauth";
import { socialChannelCredentials } from "../src/lib/social-channel-credentials";
import { okProvider, okSignature, okSessionSecret } from "../src/lib/publishing/ok";
import { connector } from "../src/lib/publishing/connector";

const app = { id: "987654", secret: "our-private-app-secret", applicationKey: "app-public-key" };
const originalFetch = globalThis.fetch;
let hits: { url: string; init: RequestInit }[] = [];
function mock(fn: (url: string, init: RequestInit) => unknown) {
  hits = [];
  globalThis.fetch = async (url, init = {}) => { hits.push({ url: String(url), init }); const data = fn(String(url), init); return data instanceof Response ? data : Response.json(data); };
}
const pic = { data: Buffer.from("picture"), mime: "image/jpeg" };

test("Social OAuth is bound to our app, tenant, user, brand, provider and one-use state", async t => {
  const db = await PGlite.create(), g = globalThis as typeof globalThis & { _pool?: unknown }, previous = g._pool, env = { ...process.env };
  try {
    process.env.APP_URL = "https://juicerai.ru";
    Object.assign(process.env, { PINTEREST_CLIENT_ID: app.id, PINTEREST_CLIENT_SECRET: app.secret, OK_CLIENT_ID: app.id, OK_CLIENT_SECRET: app.secret, OK_APPLICATION_KEY: app.applicationKey, META_CLIENT_ID: app.id, META_CLIENT_SECRET: app.secret, THREADS_CLIENT_ID: app.id, THREADS_CLIENT_SECRET: app.secret });
    await db.exec(await readFile(new URL("../db/adminer-schema.sql", import.meta.url), "utf8"));
    const query = (sql: string, params: unknown[] = []) => db.query(sql, params);
    g._pool = { query, connect: async () => ({ query, release() {} }) };
    const first = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows[0].id;
    const user = await first("insert into kz_users(email,name,password_hash) values('social@test.ru','User','x') returning id");
    const other = await first("insert into kz_users(email,name,password_hash) values('social2@test.ru','Other','x') returning id");
    const org = await first("insert into kz_orgs(name) values('Org') returning id"), foreignOrg = await first("insert into kz_orgs(name) values('Other') returning id");
    const brand = await first("insert into kz_brands(org_id,name) values($1,'Brand') returning id", [org]);
    const brand2 = await first("insert into kz_brands(org_id,name) values($1,'Brand2') returning id", [org]);
    const foreignBrand = await first("insert into kz_brands(org_id,name) values($1,'Foreign') returning id", [foreignOrg]);
    const factory = await first("insert into kz_factories(org_id,brand_id,name) values($1,$2,'Factory') returning id", [org, brand]);
    await t.test("authorization links use our client ID, public callback, minimal scopes and never expose the secret", () => {
      for (const p of SOCIAL_PROVIDERS) {
        const u = new URL(socialAuthorizeUrl(p, app, "our-state"));
        assert.equal(u.searchParams.get("client_id"), app.id); assert.equal(u.searchParams.get("state"), "our-state");
        assert.equal(u.searchParams.get("redirect_uri"), `https://juicerai.ru/api/channels/oauth/${p}/callback`);
        assert.doesNotMatch(u.href, /api\.smp\.io|smm-planner|our-private/); assert.equal(u.searchParams.get("response_type"), "code");
        assert.doesNotMatch(u.searchParams.get("scope")!, /GET_EMAIL|ads_management|boards:write/);
      }
    });
    await t.test("settings prefer encrypted admin values and report an unconfigured app", async () => {
      await db.query("insert into kz_platform_settings(key,value) values('oauth:pinterest',$1)", [JSON.stringify(seal({ id: "123456", secret: "admin-secret", applicationKey: "" }))]);
      assert.equal((await socialAppConfig("pinterest"))?.id, "123456");
      const raw = (await db.query("select value from kz_platform_settings where key='oauth:pinterest'")).rows[0]; assert.ok(!JSON.stringify(raw).includes("admin-secret"));
      await db.query("delete from kz_platform_settings where key='oauth:pinterest'");
      delete process.env.PINTEREST_CLIENT_SECRET;
      await assert.rejects(startConnection(org, user, brand, "pinterest"), /Администратору/);
      process.env.PINTEREST_CLIENT_SECRET = app.secret;
    });
    await t.test("rejects foreign brand/factory and non-HTTPS callback", async () => {
      await assert.rejects(startConnection(org, user, foreignBrand, "pinterest"), /бренд/);
      await assert.rejects(startConnection(org, user, brand2, "pinterest", factory), /Завод/);
      process.env.APP_URL = "http://0.0.0.0:3000"; assert.throws(() => socialRedirectUri("pinterest"), /HTTPS/); process.env.APP_URL = "https://juicerai.ru";
    });
    let pinterestChannel = "";
    await t.test("Pinterest callback enumerates boards, encrypts tokens and exposes only options", async () => {
      mock(url => url.includes("/oauth/token") ? { access_token: "pina-private", refresh_token: "pinr-private", expires_in: 3600, scope: "boards:read,pins:write" } : { items: [{ id: "111", name: "Board one" }, { id: "222", name: "Board two" }] });
      const start = await startConnection(org, user, brand, "pinterest", factory), state = new URL(start.url).searchParams.get("state")!;
      await assert.rejects(finishSocialConnection(foreignOrg, user, "pinterest", state, "code"));
      await assert.rejects(finishSocialConnection(org, other, "pinterest", state, "code"));
      await assert.rejects(finishSocialConnection(org, user, "ok", state, "code")); assert.equal(hits.length, 0);
      await finishSocialConnection(org, user, "pinterest", state, "code");
      const tokenCall = hits[0]; assert.equal(new Headers(tokenCall.init.headers).get("Authorization"), `Basic ${Buffer.from(`${app.id}:${app.secret}`).toString("base64")}`);
      assert.equal((tokenCall.init.body as URLSearchParams).get("redirect_uri"), "https://juicerai.ru/api/channels/oauth/pinterest/callback");
      const status = await connectionStatus(org, user, start.id); assert.equal(status.status, "ready"); assert.equal(status.options.length, 2); assert.doesNotMatch(JSON.stringify(status), /pina-private|pinr-private/);
      const stored = (await db.query<{ payload: unknown }>("select payload from kz_channel_connections where id=$1", [start.id])).rows[0]; assert.doesNotMatch(JSON.stringify(stored), /pina-private/);
      await assert.rejects(connectSelected(org, user, start.id, "999"), /из списка/);
      await connectSelected(org, user, start.id, "111");
      pinterestChannel = (await db.query<{ id: string }>("select id from kz_channels where org_id=$1 and kind='pinterest'", [org])).rows[0].id;
      assert.ok((await db.query<{ channel_ids: string[] }>("select channel_ids from kz_factories where id=$1", [factory])).rows[0].channel_ids.includes(pinterestChannel));
      assert.deepEqual((await db.query<{ payload: unknown }>("select payload from kz_channel_connections where id=$1", [start.id])).rows[0].payload, {});
      await assert.rejects(finishSocialConnection(org, user, "pinterest", state, "code")); await assert.rejects(connectSelected(org, user, start.id, "111"));
    });
    await t.test("reconnection is restricted to the original board and updates the existing channel", async () => {
      const start = await startConnection(org, user, brand, "pinterest", undefined, pinterestChannel);
      await finishSocialConnection(org, user, "pinterest", new URL(start.url).searchParams.get("state")!, "code");
      const status = await connectionStatus(org, user, start.id); assert.deepEqual(status.options.map(o => o.id), ["111"]);
      await connectSelected(org, user, start.id, "111");
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from kz_channels where kind='pinterest'")).rows[0].n, 1);
    });
    await t.test("same board cannot be connected to another brand", async () => {
      const start = await startConnection(org, user, brand2, "pinterest");
      await finishSocialConnection(org, user, "pinterest", new URL(start.url).searchParams.get("state")!, "code");
      await assert.rejects(connectSelected(org, user, start.id, "111"), /другому бренду/);
    });
    await t.test("denial, empty scopes, expiry and changed app are terminal and erase temporary credentials", async () => {
      for (const mode of ["denied", "scope", "changed", "expired"]) {
        const start = await startConnection(org, user, brand, "pinterest"), state = new URL(start.url).searchParams.get("state")!;
        if (mode === "changed") process.env.PINTEREST_CLIENT_ID = "111222";
        if (mode === "expired") await db.query("update kz_channel_connections set expires_at=now()-interval '1 minute' where id=$1", [start.id]);
        mock(() => ({ access_token: "private", scope: "boards:read" }));
        if (mode === "expired") await assert.rejects(finishSocialConnection(org, user, "pinterest", state, "code"));
        else { await finishSocialConnection(org, user, "pinterest", state, "code", mode === "denied"); assert.equal((await connectionStatus(org, user, start.id)).status, "failed"); assert.deepEqual((await db.query<{ payload: unknown }>("select payload from kz_channel_connections where id=$1", [start.id])).rows[0].payload, {}); }
        process.env.PINTEREST_CLIENT_ID = app.id;
      }
    });
    await t.test("refresh updates encrypted credentials before publishing and rotates refresh token", async () => {
      const old = { token: "expired", refreshToken: "old-refresh", oauth: "pinterest", appId: app.id, expiresAt: "0", target: "111" };
      await db.query("update kz_channels set credentials=$2 where id=$1", [pinterestChannel, JSON.stringify(seal(old))]);
      mock(() => ({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }));
      await assert.rejects(socialChannelCredentials(foreignOrg, pinterestChannel, "pinterest", seal(old)), /Канал/); assert.equal(hits.length, 0);
      const next = await socialChannelCredentials(org, pinterestChannel, "pinterest", seal(old)); assert.equal(next.token, "new-access"); assert.equal(next.refreshToken, "new-refresh");
      const stored = (await db.query<{ credentials: unknown }>("select credentials from kz_channels where id=$1", [pinterestChannel])).rows[0].credentials; assert.doesNotMatch(JSON.stringify(stored), /new-access|new-refresh/); assert.equal(open(stored).target, "111");
      await socialChannelCredentials(org, pinterestChannel, "pinterest", seal(old)); assert.equal(hits.length, 1);
    });
    await t.test("native OK OAuth lists only manageable groups and saves signature material", async () => {
      mock((url, init) => {
        if (url.includes("/oauth/token.do")) return { access_token: "ok-access", refresh_token: "ok-refresh", expires_in: 3600 };
        const method = (init.body as URLSearchParams).get("method");
        if (method === "group.getUserGroupsV2") return { groups: [{ groupId: "333", role: ["EDITOR"], status: "ACTIVE" }, { groupId: "444", role: ["ANALYST"], status: "ACTIVE" }] };
        return [{ uid: "333", name: "OK group" }];
      });
      const start = await startConnection(org, user, brand, "ok"), state = new URL(start.url).searchParams.get("state")!;
      await finishSocialConnection(org, user, "ok", state, "code"); assert.deepEqual((await connectionStatus(org, user, start.id)).options, [{ id: "333", title: "OK group" }]);
      await connectSelected(org, user, start.id, "333");
      const c = open((await db.query<{ credentials: unknown }>("select credentials from kz_channels where kind='ok'")).rows[0].credentials); assert.equal(c.sessionSecret, okSessionSecret("ok-access", app.secret)); assert.equal(c.applicationKey, app.applicationKey);
    });
    await t.test("Facebook/Instagram use long-lived exchange and only pages with publish tasks", async () => {
      mock(url => url.includes("oauth/access_token") ? { access_token: url.includes("fb_exchange_token") ? "long-user-token" : "short-user-token", expires_in: 3600 } : { data: [{ id: "555", name: "Page", access_token: "page-token", tasks: ["CREATE_CONTENT"], instagram_business_account: { id: "666", username: "brand_ig" } }, { id: "777", name: "Read only", access_token: "other-token", tasks: ["ANALYZE"] }] });
      for (const provider of ["facebook", "instagram"] as const) {
        const token = await exchangeSocialCode(provider, "code", app), opts = await socialOptions(provider, token); assert.equal(token.token, "long-user-token"); assert.equal(opts.length, 1); assert.equal(opts[0].id, provider === "instagram" ? "666" : "555"); assert.equal(opts[0].credentials.token, "page-token"); assert.ok(!opts[0].credentials.expiresAt);
      }
    });
    await t.test("Threads exchanges short-lived token and selects its returned profile", async () => {
      mock(url => url.includes("/oauth/access_token") ? { access_token: "short", user_id: "888" } : url.includes("/access_token?") ? { access_token: "long-threads", expires_in: 5184000 } : { id: "888", username: "brand_threads" });
      const token = await exchangeSocialCode("threads", "code", app), opts = await socialOptions("threads", token); assert.equal(token.token, "long-threads"); assert.equal(opts[0].id, "888"); assert.ok(Number(token.expiresAt) > Date.now() + 5000000000);
    });
    await t.test("pagination uses trusted endpoints and preserves all board choices", async () => {
      mock(url => url.includes("bookmark=next") ? { items: [{ id: "2", name: "Second" }] } : { items: [{ id: "1", name: "First" }], bookmark: "next" });
      assert.equal((await socialOptions("pinterest", { token: "token" })).length, 2);
      assert.ok(hits.every(h => new URL(h.url).hostname === "api.pinterest.com"));
    });
  } finally { globalThis.fetch = originalFetch; process.env = env; g._pool = previous; await db.close(); }
});

test("OK signs canonical params, preserves carousel order and publishes only after all photos uploaded", async () => {
  const signature = okSignature({ method: "mediatopic.post", application_key: "key", format: "json", access_token: "excluded" }, "session");
  assert.equal(signature, createHash("md5").update("application_key=keyformat=jsonmethod=mediatopic.postsession").digest("hex"));
  let uploaded = 0;
  const provider = okProvider(async (_, o) => { uploaded++; assert.ok((o.body as FormData).get("pic1")); return { status: 200, text: JSON.stringify({ photos: { [`photo${uploaded}`]: { token: `token${uploaded}` } } }) }; });
  let nextId = 0;
  mock((_, init) => {
    const b = init.body as URLSearchParams;
    if (b.get("method") === "photosV2.getUploadUrl") return { upload_url: "https://upload.ok.ru/test", photo_ids: [`photo${++nextId}`] };
    assert.equal(uploaded, 2); assert.deepEqual(JSON.parse(b.get("attachment")!).media[1].list, [{ id: "token1" }, { id: "token2" }]); return "999";
  });
  try { const out = await provider.publish({ text: "Post", images: [pic, pic] }, { target: "333", token: "token", applicationKey: "key", sessionSecret: "session" }); assert.equal(out.url, "https://ok.ru/group/333/topic/999"); }
  finally { globalThis.fetch = originalFetch; }
});
test("OK failed photo upload never sends a partial post", async () => {
  const provider = okProvider(async () => ({ status: 200, text: '{"photos":{}}' }));
  mock(() => ({ upload_url: "https://upload.ok.ru/test", photo_ids: ["photo"] }));
  try { await assert.rejects(provider.publish({ text: "Post", image: pic }, { target: "333", token: "token", applicationKey: "key", sessionSecret: "session" }), /не подтвердили загрузку/); assert.equal(hits.length, 1); }
  finally { globalThis.fetch = originalFetch; }
});
test("Old OK external connector continues sending platform=ok after kind migration", async () => {
  const p = connector("ok_connector", async (_, o) => { const input = JSON.parse(String(o.body)); assert.equal(input.platform, "ok"); return { status: 200, text: JSON.stringify({ ok: true, platform: "ok", account: "brand", capabilities: ["text"] }) }; });
  await p.verify({ target: "https://connector.example", token: "secret", account: "brand" });
});
test("Migration separates legacy OK connectors and never converts new native OK channels on schema replay", async () => {
  const db = await PGlite.create();
  try {
    await db.exec("create table kz_channels(kind text); create table kz_channel_connections(provider text); insert into kz_channels(kind) values('ok')");
    const sql = await readFile(new URL("../db/042_social_oauth.sql", import.meta.url), "utf8"); await db.exec(sql);
    assert.equal((await db.query<{ kind: string }>("select kind from kz_channels")).rows[0].kind, "ok_connector");
    await db.exec("insert into kz_migrations(name) values('042_social_oauth.sql'); insert into kz_channels(kind) values('ok')");
    await db.exec(sql);
    assert.deepEqual((await db.query<{ kind: string }>("select kind from kz_channels order by kind")).rows.map(r => r.kind), ["ok", "ok_connector"]);
  } finally { await db.close(); }
});
