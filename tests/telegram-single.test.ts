import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";

type Hit = { method: string; body: string };
const hits: Hit[] = [];
let srv: http.Server;
let imgSrv: http.Server, imgBase = "";
let tg: typeof import("../src/lib/publishing/telegram");
let jpg: Buffer;

before(async () => {
  jpg = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#3366ff" } }).jpeg().toBuffer();
  srv = http.createServer((req, res) => {
    const c: Buffer[] = []; req.on("data", (d) => c.push(d));
    req.on("end", () => {
      const method = req.url!.split("/").pop()!;
      hits.push({ method, body: Buffer.concat(c).toString("latin1") });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, result: { message_id: hits.length } }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  imgSrv = http.createServer((req, res) => {
    if (req.headers["user-agent"]?.includes("TelegramBot") && req.url === "/ok") { res.setHeader("Content-Type", "image/jpeg"); return res.end(jpg); }
    res.statusCode = 403; res.setHeader("Content-Type", "text/html"); res.end("<html>Security Checkpoint</html>");
  });
  await new Promise<void>((r) => imgSrv.listen(0, "127.0.0.1", r));
  imgBase = `http://127.0.0.1:${(imgSrv.address() as AddressInfo).port}`;
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  tg = await import("../src/lib/publishing/telegram");
});
after(() => { srv.closeAllConnections?.(); srv.close(); imgSrv.closeAllConnections?.(); imgSrv.close(); });

const cred = { token: "T", target: "@chan" };
const methods = () => hits.map((h) => h.method);
const run = async (text: string, extra: object = {}) => { hits.length = 0; const r = await tg.telegram.publish({ text, image: { data: jpg, mime: "image/jpeg" }, ...extra }, cred); return r; };

describe("Telegram: картинка и текст одним постом", () => {
  it("текст до 1024 знаков: одно сообщение — фото с подписью", async () => {
    await run("Короткий пост".repeat(10));
    assert.deepEqual(methods(), ["sendPhoto"]);
    assert.match(hits[0].body, /name="caption"/);
  });
  it("длинный текст и задан публичный адрес картинки: одно сообщение, превью картинки над текстом", async () => {
    await run("Длинный пост. ".repeat(200), { imageUrl: `${imgBase}/ok` });
    assert.deepEqual(methods(), ["sendMessage"]);
    const j = JSON.parse(hits[0].body);
    assert.equal(j.link_preview_options.url, `${imgBase}/ok`);
    assert.equal(j.link_preview_options.show_above_text, true);
  });
  it("ссылка на картинку недоступна боту (защита хостинга): два сообщения и предупреждение, картинка не теряется", async () => {
    const r = await run("Длинный пост. ".repeat(200), { imageUrl: `${imgBase}/blocked` });
    assert.deepEqual(methods(), ["sendPhoto", "sendMessage"]);
    assert.match(r.warning ?? "", /отдельным сообщением/);
  });
  it("длинный текст без публичного адреса: два сообщения (фото, затем текст)", async () => {
    await run("Длинный пост. ".repeat(200));
    assert.deepEqual(methods(), ["sendPhoto", "sendMessage"]);
  });
  it("текст длиннее 4000 знаков делится на части, но фото всё равно одно", async () => {
    await run("Очень длинный пост. ".repeat(400), { imageUrl: `${imgBase}/ok` });
    assert.equal(methods().filter((m) => m === "sendPhoto").length, 1);
  });
});
