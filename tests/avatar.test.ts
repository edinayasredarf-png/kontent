import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";

/** Часть тестов нужна БД: TEST_DATABASE_URL с применённой db/adminer-schema.sql (временная, не боевая). Реальных запросов к Яндексу и VK нет. */
const URL_ = process.env.TEST_DATABASE_URL;
const skipDb = !URL_ && "нет TEST_DATABASE_URL";

let av: typeof import("../src/lib/avatar");
let oauth: typeof import("../src/lib/oauth");
let db: typeof import("../src/lib/db");
let srv: http.Server, base = "", png: Buffer;
let uid = "";

before(async () => {
  process.env.ALLOW_PRIVATE_FETCH = "1";
  process.env.AUTH_SECRET = "test-secret";
  process.env.YANDEX_CLIENT_ID = "ya-id"; process.env.YANDEX_CLIENT_SECRET = "ya-secret"; process.env.VK_CLIENT_ID = "1234567";
  png = await sharp({ create: { width: 600, height: 300, channels: 3, background: "#cc3355" } }).png().toBuffer();
  srv = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    if (u.pathname === "/ya/info") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ id: "77", client_id: "ya-id", real_name: "Яна", default_email: "ya@t.ru", default_avatar_id: "abc/123", is_avatar_empty: u.searchParams.get("empty") === "1" })); }
    if (u.pathname === "/vk/oauth2/user_info") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ user: { user_id: 5, first_name: "Вик", last_name: "К", avatar: `${base}/pic.png` } })); }
    if (u.pathname === "/pic.png") { res.setHeader("Content-Type", "image/png"); return res.end(png); }
    if (u.pathname === "/big.bin") { res.setHeader("Content-Type", "application/octet-stream"); return res.end(Buffer.alloc(100_000, 1)); }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.YANDEX_LOGIN_BASE = `${base}/ya`; process.env.VK_ID_BASE = `${base}/vk`;
  av = await import("../src/lib/avatar");
  oauth = await import("../src/lib/oauth");
  if (URL_) {
    process.env.DATABASE_URL = URL_;
    db = await import("../src/lib/db");
    await db.q("delete from kz_users where email like 'avatar-test-%'");
    uid = (await db.one<{ id: string }>("insert into kz_users(email,name,password_hash) values('avatar-test-1@t.ru','А','x') returning id"))!.id;
  }
});
after(async () => { if (URL_) await db.q("delete from kz_users where email like 'avatar-test-%'"); srv.closeAllConnections?.(); srv.close(); });

describe("обработка аватарки", () => {
  it("любое фото превращается в квадрат 256×256 webp", async () => {
    for (const [w, h] of [[600, 300], [300, 900], [100, 100]]) {
      const src = await sharp({ create: { width: w, height: h, channels: 3, background: "#123456" } }).jpeg().toBuffer();
      const m = await sharp(await av.processAvatar(src)).metadata();
      assert.deepEqual([m.width, m.height, m.format], [256, 256, "webp"]);
    }
  });
  it("не картинка и слишком большой файл отклоняются с понятной ошибкой", async () => {
    await assert.rejects(av.processAvatar(Buffer.from("not an image")), /не похож на изображение/);
    await assert.rejects(av.processAvatar(Buffer.alloc(7 * 1024 * 1024)), /больше 6 МБ/);
  });
  it("адрес аватарки: только https и только CDN Яндекса или VK (SSRF)", () => {
    assert.ok(av.avatarUrlAllowed("https://avatars.yandex.net/get-yapic/1/islands-200", "yandex"));
    assert.ok(av.avatarUrlAllowed("https://sun9-1.userapi.com/x.jpg", "vk"));
    for (const bad of ["http://avatars.yandex.net/a", "https://evil.example/a", "https://avatars.yandex.net.evil.com/a", "https://169.254.169.254/latest", "file:///etc/passwd", "javascript:alert(1)"]) assert.equal(av.avatarUrlAllowed(bad, "yandex"), false, bad);
    assert.equal(av.avatarUrlAllowed("https://avatars.yandex.net/a", "vk"), false, "адрес Яндекса не годится для VK");
  });
});

describe("профиль провайдера", () => {
  it("Яндекс: ссылка на аватарку собирается из default_avatar_id, заглушка не берётся", async () => {
    const p = await oauth.yandexProfileFromToken("tok-12345678901");
    assert.equal(p.avatar, "https://avatars.yandex.net/get-yapic/abc/123/islands-200");
    const ya = await fetch(`${base}/ya/info?empty=1`).then((r) => r.json()) as { is_avatar_empty: boolean };
    assert.equal(ya.is_avatar_empty, true);
  });
  it("VK ID: аватарка берётся из user_info", async () => {
    const p = await oauth.vkProfileFromToken("tok-12345678901");
    assert.equal(p.avatar, `${base}/pic.png`);
  });
});

describe("сохранение аватарки", { skip: skipDb }, () => {
  it("импорт из провайдера сохраняет фото с источником; повторный вход обновляет его", async () => {
    assert.equal(await av.importProviderAvatar(uid, "vk", `${base}/pic.png`, true), true);
    const r = await db.one<{ source: string; data: Buffer }>("select source,data from kz_user_avatars where user_id=$1", [uid]);
    assert.equal(r!.source, "vk");
    assert.deepEqual([(await sharp(r!.data).metadata()).width], [256]);
    assert.equal(await av.importProviderAvatar(uid, "yandex", `${base}/pic.png`, true), true);
    assert.equal((await db.one<{ source: string }>("select source from kz_user_avatars where user_id=$1", [uid]))!.source, "yandex");
  });
  it("своё загруженное фото провайдер не затирает", async () => {
    await av.saveAvatar(uid, png, "upload");
    assert.equal(await av.importProviderAvatar(uid, "vk", `${base}/pic.png`, true), false);
    assert.equal((await db.one<{ source: string }>("select source from kz_user_avatars where user_id=$1", [uid]))!.source, "upload");
  });
  it("сбои импорта (нет адреса, чужой хост, не картинка) тихо возвращают false и не ломают вход", async () => {
    assert.equal(await av.importProviderAvatar(uid, "vk", null), false);
    assert.equal(await av.importProviderAvatar(uid, "vk", "https://evil.example/a.png"), false);
    await db.q("delete from kz_user_avatars where user_id=$1", [uid]);
    assert.equal(await av.importProviderAvatar(uid, "vk", `${base}/big.bin`, true), false);
    assert.equal((await db.q("select 1 from kz_user_avatars where user_id=$1", [uid])).length, 0);
  });
  it("удаление убирает фото", async () => {
    await av.saveAvatar(uid, png, "upload");
    await av.deleteAvatar(uid);
    assert.equal(await av.loadAvatar(uid), null);
  });
});
