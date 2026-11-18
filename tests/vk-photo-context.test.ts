import { before, after, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { vk } from "../src/lib/publishing/vk";
let server: http.Server, base: string;
let copied = false;
const seen: { method: string; params: URLSearchParams }[] = [];
before(async () => {
  server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const method = req.url!.split("/").at(-1)!, params = new URLSearchParams(raw);
    const send = (response: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ response })); };
    if (method === "upload") return sendUpload();
    function sendUpload() { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ server: 1, photo: "[{}]", hash: "hash" })); }
    seen.push({ method, params });
    if (method === "groups.getById") return send({ groups: [{ name: "Community" }] });
    if (method === "photos.getWallUploadServer") {
      if (params.get("access_token") === "group-key") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: { error_code: 27, error_msg: "Group authorization failed" } })); }
      return send({ upload_url: `${base}/upload` });
    }
    if (method === "photos.saveWallPhoto") return send([{ id: 123, owner_id: 750414152, access_key: "private-photo-access" }]);
    if (method === "wall.post") {
      assert.equal(params.get("access_token"), "user-key");
      assert.equal(params.get("attachments"), "photo750414152_123_private-photo-access");
      assert.equal(params.get("owner_id"), "-42");
      assert.equal(params.get("from_group"), "1");
      return send({ post_id: 321 });
    }
    if (method === "wall.getById") {
      assert.equal(params.get("access_token"), "user-key");
      return send({ items: [{ attachments: [{ type: "photo", photo: copied ? { id: 456239999, owner_id: -42 } : { id: 123, owner_id: 750414152 } }] }] });
    }
    res.statusCode = 400; res.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.VK_API_BASE = base;
});
after(() => { server.closeAllConnections(); server.close(); });
it("uses the photo owner token for posting and checking, retaining access_key", async () => {
  const result = await vk.publish({ text: "Post", image: { data: Buffer.from("jpeg"), mime: "image/jpeg" } }, { token: "group-key", photoToken: "user-key", target: "42" });
  assert.equal(result.url, "https://vk.com/wall-42_321");
  for (const entry of seen.filter(e => ["photos.getWallUploadServer", "photos.saveWallPhoto", "wall.post", "wall.getById"].includes(e.method))) assert.equal(entry.params.get("access_token"), "user-key");
  assert.equal(seen.some(e => e.method.startsWith("docs.") || e.method === "wall.delete"), false);
});
it("explains that a group token was entered into the user token field", async () => {
  await assert.rejects(vk.verify({ token: "group-key", photoToken: "group-key", target: "42" }), /В это поле введён ключ сообщества/);
});

it("accepts VK copying the uploaded user photo to a different community photo ID", async () => {
  copied = true;
  const before = seen.length;
  const result = await vk.publish({ text: "Post", image: { data: Buffer.from("jpeg"), mime: "image/jpeg" } }, { token: "group-key", photoToken: "user-key", target: "42" });
  assert.equal(result.url, "https://vk.com/wall-42_321");
  assert.equal(seen.slice(before).some(call => call.method === "wall.delete"), false);
});
