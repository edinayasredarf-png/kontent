import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";

/** Пост с картинкой в VK не публикуется без неё: ни когда загрузка отказала, ни когда нельзя проверить, что картинка прикрепилась. */
let srv: http.Server, base = "", calls: string[] = [], png: Buffer, mode: "fail" | "unverified" | "verified" = "fail";

before(async () => {
  png = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#cc0000" } }).png().toBuffer();
  srv = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    const m = u.pathname.replace("/method/", "");
    const json = (o: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    if (u.pathname === "/upload") return json({ server: 1, photo: "[{}]", hash: "h" });
    calls.push(m);
    const err = (code: number, msg: string) => json({ error: { error_code: code, error_msg: msg } });
    if (m === "photos.getWallUploadServer") return err(27, "group auth");
    if (m === "docs.getWallUploadServer") return err(15, "denied");
    if (m === "photos.getMessagesUploadServer") return mode === "fail" ? err(15, "no rights") : json({ response: { upload_url: `${base}/upload` } });
    if (m === "photos.saveMessagesPhoto") return json({ response: [{ id: 5, owner_id: -1, access_key: "k" }] });
    if (m === "wall.post") return json({ response: { post_id: 77 } });
    if (m === "wall.getById") return mode === "verified" ? json({ response: [{ attachments: [{}] }] }) : err(15, "no access");
    if (m === "wall.delete") return json({ response: 1 });
    return err(100, "unknown");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.VK_API_BASE = base;
});
after(() => { srv.close(); });

const creds = { token: "t", target: "1" };
const img = () => ({ data: png, mime: "image/png" });

describe("VK: картинка обязательна, если она есть у материала", () => {
  it("без картинки пост публикуется как обычно", async () => {
    calls = []; mode = "fail";
    const { vk } = await import("../src/lib/publishing/vk");
    const r = await vk.publish({ text: "Просто текст" }, creds);
    assert.equal(r.externalId, "77"); assert.equal(r.warning, undefined);
  });
  it("все способы загрузки отказали — пост не уходит вообще", async () => {
    calls = []; mode = "fail";
    const { vk } = await import("../src/lib/publishing/vk");
    await assert.rejects(vk.publish({ text: "С картинкой", image: img() }, creds), /Пост не опубликован/);
    assert.equal(calls.includes("wall.post"), false, "wall.post не вызывался");
  });
  it("картинку нельзя проверить — созданный пост удаляется, публикация отклоняется", async () => {
    calls = []; mode = "unverified";
    const { vk } = await import("../src/lib/publishing/vk");
    await assert.rejects(vk.publish({ text: "С картинкой", image: img() }, creds), /Пост не опубликован: VK не позволил проверить/);
    assert.ok(calls.includes("wall.post") && calls.includes("wall.delete"), "пост создан и тут же удалён");
  });
  it("картинка проверена в посте — публикуется", async () => {
    calls = []; mode = "verified";
    const { vk } = await import("../src/lib/publishing/vk");
    const r = await vk.publish({ text: "С картинкой", image: img() }, creds);
    assert.equal(r.externalId, "77"); assert.equal(calls.includes("wall.delete"), false);
  });
});
