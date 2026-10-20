import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fail, mockVk, ok } from "./mock-vk";

/** Нужна БД: TEST_DATABASE_URL с применённой db/adminer-schema.sql (временная, не боевая). */
const URL = process.env.TEST_DATABASE_URL;
const skip = !URL && "нет TEST_DATABASE_URL";

let vkm: Awaited<ReturnType<typeof mockVk>>;
let vc: typeof import("../src/lib/vk-connect");
let db: typeof import("../src/lib/db");
let orgA = "", orgB = "", userA = "", userB = "", brandA = "";

before(async () => {
  if (!URL) return;
  process.env.DATABASE_URL = URL;
  process.env.AUTH_SECRET = "test-secret";
  process.env.VK_CLIENT_ID = "1234567";
  process.env.APP_URL = "https://app.example";
  vkm = await mockVk();
  process.env.VK_API_BASE = vkm.base;
  process.env.VK_ID_BASE = vkm.base;
  db = await import("../src/lib/db");
  vc = await import("../src/lib/vk-connect");
  await db.q("delete from kz_orgs where name like 'vk-test-%'");
  await db.q("delete from kz_users where email like 'vk-test-%'");
  for (const k of ["A", "B"]) {
    const u = await db.one<{ id: string }>("insert into kz_users(email,name,password_hash) values($1,$2,'x') returning id", [`vk-test-${k}@t.ru`, k]);
    const o = await db.one<{ id: string }>("insert into kz_orgs(name) values($1) returning id", [`vk-test-${k}`]);
    await db.q("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [o!.id, u!.id]);
    if (k === "A") { userA = u!.id; orgA = o!.id; brandA = (await db.one<{ id: string }>("insert into kz_brands(org_id,name) values($1,'Б') returning id", [o!.id]))!.id; } else { userB = u!.id; orgB = o!.id; }
  }
});
after(async () => { if (!URL) return; await db.q("delete from kz_orgs where name like 'vk-test-%'"); await db.q("delete from kz_users where email like 'vk-test-%'"); await vkm.close(); });
beforeEach(() => vkm?.clear());

const req = new Request("https://app.example/api/vk/connect/callback");
const tokenOk = (extra: object = {}) => () => ({ access_token: "ACCESS-1", refresh_token: "REFRESH-1", expires_in: 3600, user_id: 555, scope: "wall photos", ...extra });
async function connect() {
  vkm.on("/oauth2/auth", tokenOk());
  vkm.on("/oauth2/user_info", () => ({ user: { user_id: 555, first_name: "Иван", last_name: "Петров" } }));
  return vc.finishConnect(req, { orgId: orgA, userId: userA, code: "c", verifier: "v", deviceId: "dev", state: "s" });
}

describe("подключение VK", { skip }, () => {
  it("сохраняет подключение за организацией и пользователем; токены в БД зашифрованы", async () => {
    const id = await connect();
    const r = await db.one<{ org_id: string; user_id: string; name: string; secrets: unknown; status: string }>("select * from kz_vk_connections where id=$1", [id]);
    assert.equal(r!.org_id, orgA); assert.equal(r!.user_id, userA); assert.equal(r!.name, "Иван Петров"); assert.equal(r!.status, "active");
    const raw = JSON.stringify(r!.secrets);
    assert.ok(!raw.includes("ACCESS-1") && !raw.includes("REFRESH-1"), "токены не лежат открытым текстом");
    const body = vkm.last("/oauth2/auth")!.params;
    assert.equal(body.code_verifier, "v"); assert.equal(body.device_id, "dev"); assert.equal(body.grant_type, "authorization_code");
  });
  it("повторное подключение того же аккаунта обновляет запись, а не дублирует", async () => {
    const a = await connect(), b = await connect();
    assert.equal(a, b);
    assert.equal((await db.q("select 1 from kz_vk_connections where org_id=$1", [orgA])).length, 1);
  });
  it("отказ VK ID при обмене кода — ошибка, подключение не создаётся", async () => {
    await db.q("delete from kz_vk_connections where org_id=$1", [orgA]);
    vkm.on("/oauth2/auth", () => ({ error: "invalid_grant", error_description: "bad code" }));
    await assert.rejects(vc.finishConnect(req, { orgId: orgA, userId: userA, code: "x", verifier: "v", deviceId: "d", state: "s" }), /bad code/);
    assert.equal((await db.q("select 1 from kz_vk_connections where org_id=$1", [orgA])).length, 0);
  });
});

describe("токен подключения", { skip }, () => {
  it("свежий токен отдаётся без обращения к VK", async () => {
    const id = await connect(); vkm.clear();
    assert.equal(await vc.connectionToken(orgA, id), "ACCESS-1");
    assert.equal(vkm.hits.length, 0);
  });
  it("чужая организация не получает токен подключения (изоляция)", async () => {
    const id = await connect();
    await assert.rejects(vc.connectionToken(orgB, id), /удалено|Подключите/);
  });
  it("истёкший токен обновляется по refresh-токену, новые значения сохраняются зашифрованно", async () => {
    const id = await connect();
    await db.q("update kz_vk_connections set expires_at=now() - interval '1 minute' where id=$1", [id]);
    vkm.on("/oauth2/auth", () => ({ access_token: "ACCESS-2", refresh_token: "REFRESH-2", expires_in: 3600 }));
    assert.equal(await vc.connectionToken(orgA, id), "ACCESS-2");
    const p = vkm.last("/oauth2/auth")!.params;
    assert.equal(p.grant_type, "refresh_token"); assert.equal(p.refresh_token, "REFRESH-1");
    assert.ok(!JSON.stringify((await db.one("select secrets from kz_vk_connections where id=$1", [id]))!.secrets).includes("ACCESS-2"));
    assert.equal(await vc.connectionToken(orgA, id), "ACCESS-2");
  });
  it("отозванное разрешение: подключение и его каналы переходят в «нужна повторная авторизация», повтор не помогает", async () => {
    const id = await connect();
    const ch = await db.one<{ id: string }>("insert into kz_channels(org_id,brand_id,kind,title,connection_id) values($1,$2,'vk','Сообщество',$3) returning id", [orgA, brandA, id]);
    await db.q("update kz_vk_connections set expires_at=now() - interval '1 minute' where id=$1", [id]);
    vkm.on("/oauth2/auth", () => ({ error: "invalid_grant", error_description: "token revoked" }));
    await assert.rejects(vc.connectionToken(orgA, id), (e: Error & { retryable?: boolean }) => e instanceof vc.ReauthError && e.retryable === false);
    assert.equal((await db.one<{ status: string }>("select status from kz_vk_connections where id=$1", [id]))!.status, "reauth");
    assert.equal((await db.one<{ status: string }>("select status from kz_channels where id=$1", [ch!.id]))!.status, "reauth");
    // и пока не переподключились — токен не выдаётся вовсе
    await assert.rejects(vc.connectionToken(orgA, id), /повторная авторизация/i);
    // повторная авторизация возвращает канал в работу
    await connect();
    assert.equal((await db.one<{ status: string }>("select status from kz_channels where id=$1", [ch!.id]))!.status, "active");
  });
  it("сетевой сбой при обновлении не выбивает подключение (временная ошибка)", async () => {
    const id = await connect();
    await db.q("update kz_vk_connections set expires_at=now() - interval '1 minute' where id=$1", [id]);
    process.env.VK_ID_BASE = "http://127.0.0.1:1";
    await assert.rejects(vc.connectionToken(orgA, id));
    process.env.VK_ID_BASE = vkm.base;
    assert.equal((await db.one<{ status: string }>("select status from kz_vk_connections where id=$1", [id]))!.status, "active");
  });
});

describe("сообщества и канал", { skip }, () => {
  it("список сообществ: права из ответа VK, «публикация доступна» только админу/редактору", async () => {
    const id = await connect();
    vkm.on("/method/groups.get", () => ok({ items: [{ id: 1, name: "Админ", type: "group", admin_level: 3, photo_50: "p" }, { id: 2, name: "Модератор", type: "page", admin_level: 1 }] }));
    const g = await vc.listGroups(orgA, id);
    assert.deepEqual(g.map((x) => [x.id, x.canPost]), [["1", true], ["2", false]]);
    assert.equal(vkm.last("/method/groups.get")!.params.filter, "admin,editor");
    assert.equal(vkm.last("/method/groups.get")!.params.access_token, "ACCESS-1");
  });
  it("канал с подключением получает токен из подключения, а в БД канала токена нет", async () => {
    const id = await connect();
    const { seal } = await import("../src/lib/crypto");
    const ch = await db.one<{ credentials: unknown; connection_id: string }>("insert into kz_channels(org_id,brand_id,kind,title,credentials,connection_id) values($1,$2,'vk','C',$3,$4) returning credentials,connection_id", [orgA, brandA, JSON.stringify(seal({ target: "77" })), id]);
    assert.ok(!JSON.stringify(ch!.credentials).includes("ACCESS"));
    const cred = await vc.resolveCred(orgA, ch!);
    assert.deepEqual([cred.token, cred.target, cred.mode], ["ACCESS-1", "77", "user"]);
    await assert.rejects(vc.resolveCred(orgB, ch!), /удалено|Подключите/);
  });
  it("ошибка VK при чтении сообществ (нет прав) доходит как понятная ошибка", async () => {
    const id = await connect();
    vkm.on("/method/groups.get", () => fail(15, "Access denied: no access to call this method"));
    await assert.rejects(vc.listGroups(orgA, id), /код 15/);
  });
});

describe("шифрование токенов", () => {
  it("значение, зашифрованное одним ключом, не читается другим", async () => {
    process.env.AUTH_SECRET = "k1"; delete process.env.CHANNEL_SECRET;
    const c = await import("../src/lib/crypto");
    const sealed = c.seal({ access: "TOP" });
    assert.ok(!JSON.stringify(sealed).includes("TOP"));
    assert.equal(c.open(sealed).access, "TOP");
    process.env.AUTH_SECRET = "k2";
    assert.throws(() => c.open(sealed));
    process.env.AUTH_SECRET = "test-secret";
  });
});
