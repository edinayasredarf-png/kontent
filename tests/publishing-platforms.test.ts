import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { discord } from "../src/lib/publishing/discord";
import { facebook, instagram, threads } from "../src/lib/publishing/meta";
import { pinterest } from "../src/lib/publishing/pinterest";
import { telegraph, telegraphContent } from "../src/lib/publishing/telegraph";
import { connector } from "../src/lib/publishing/connector";
import { api, mediaUrls } from "../src/lib/publishing/http";
import { PublishError } from "../src/lib/publishing/types";
import { DIRECT_CHANNELS, CONNECTOR_CHANNELS } from "../src/lib/publishing/catalog";

const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const cred = { target: "123", token: "secret-token" };
const image = { data: Buffer.from("image"), mime: "image/jpeg" };
const carousel = { text: "Текст", images: [image, image], imageUrls: ["https://juicerai.ru/one", "https://juicerai.ru/two"] };
function mocked(fn: (url: string, init: RequestInit, index: number) => unknown) {
  const hits: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (u, init = {}) => {
    const url = String(u); hits.push({ url, init });
    const j = fn(url, init, hits.length);
    return j instanceof Response ? j : Response.json(j);
  };
  return hits;
}
test("Discord validates webhook host without sending credentials to another domain", async () => {
  const hits = mocked(() => ({}));
  for (const target of ["https://evil.test/api/webhooks/12/token", "https://discord.com.evil.test/api/webhooks/12/token", "http://discord.com/api/webhooks/12/token"]) await assert.rejects(discord.verify({ target }), /discord/i);
  assert.equal(hits.length, 0);
});
test("Discord sends every carousel attachment in order and waits for real message", async () => {
  const hits = mocked(() => ({ id: "555", channel_id: "333", guild_id: "222" }));
  const out = await discord.publish(carousel, { target: "https://discord.com/api/webhooks/123/token" });
  assert.match(hits[0].url, /wait=true/);
  const form = hits[0].init.body as FormData, payload = JSON.parse(String(form.get("payload_json")));
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.deepEqual(payload.attachments.map((a: { id: number }) => a.id), [0, 1]);
  assert.ok(form.get("files[0]")); assert.ok(form.get("files[1]"));
  assert.equal(out.url, "https://discord.com/channels/222/333/555");
});
test("Discord refuses oversized text before any publish call", async () => {
  const hits = mocked(() => ({}));
  await assert.rejects(discord.publish({ text: "x".repeat(2001) }, { target: "https://discord.com/api/webhooks/123/token" }), /2000/);
  assert.equal(hits.length, 0);
});
test("Facebook uploads unpublished photos then attaches all IDs to one feed post", async () => {
  const hits = mocked((u, _, n) => u.includes("/photos") ? { id: String(n) } : u.includes("permalink") ? { permalink_url: "https://facebook.com/123/posts/55" } : { id: "123_55" });
  await facebook.publish(carousel, cred);
  assert.equal(hits.filter(h => h.url.endsWith("/photos")).length, 2);
  assert.equal((hits[0].init.body as FormData).get("published"), "false");
  const feed = hits.find(h => h.url.endsWith("/feed"))!;
  assert.deepEqual(JSON.parse((feed.init.body as URLSearchParams).get("attached_media")!), [{ media_fbid: "1" }, { media_fbid: "2" }]);
  assert.equal(new Headers(feed.init.headers).get("Authorization"), "Bearer secret-token");
});
test("Successful Facebook publish is not failed when permalink lookup fails", async () => {
  mocked(u => u.includes("permalink") ? new Response("", { status: 403 }) : { id: "123_55" });
  const result = await facebook.publish({ text: "Post" }, cred);
  assert.equal(result.externalId, "123_55"); assert.equal(result.url, null);
});
test("Instagram carousel preserves order, uses JPEG URLs and waits for containers", async () => {
  const hits = mocked((u, _, n) => u.includes("status_code") ? { status_code: "FINISHED" } : u.includes("permalink") ? { permalink: "https://instagram.com/p/55" } : { id: String(n) });
  await instagram.publish(carousel, cred);
  const create = hits.filter(h => h.url.endsWith("/media"));
  assert.equal(create.length, 3);
  assert.equal((create[0].init.body as URLSearchParams).get("image_url"), "https://juicerai.ru/one?format=jpeg");
  assert.equal((create[1].init.body as URLSearchParams).get("image_url"), "https://juicerai.ru/two?format=jpeg");
  assert.equal((create[2].init.body as URLSearchParams).get("children"), "1,3");
  assert.equal(hits.filter(h => h.url.endsWith("/media_publish")).length, 1);
});
test("Instagram cannot silently lose a missing carousel URL", async () => {
  const hits = mocked(() => ({}));
  await assert.rejects(instagram.publish({ ...carousel, imageUrls: ["https://juicerai.ru/one"] }, cred), /каждого изображения/);
  assert.equal(hits.length, 0);
});
test("Instagram refuses text-only posts", async () => {
  const hits = mocked(() => ({})); await assert.rejects(instagram.publish({ text: "Post" }, cred), /изображение/); assert.equal(hits.length, 0);
});
test("Instagram processing error prevents media_publish", async () => {
  const hits = mocked(u => u.includes("status_code") ? { status_code: "ERROR" } : { id: "55" });
  await assert.rejects(instagram.publish({ text: "Post", image, imageUrl: "https://juicerai.ru/img" }, cred), /не готово/);
  assert.equal(hits.some(h => h.url.endsWith("/media_publish")), false);
});
test("Threads supports text-only with two-step publishing", async () => {
  const hits = mocked(u => u.includes("?fields=status") ? { status: "FINISHED" } : u.includes("permalink") ? { permalink: "https://threads.com/@test/post/55" } : { id: "55" });
  await threads.publish({ text: "Short post" }, cred);
  assert.equal((hits[0].init.body as URLSearchParams).get("media_type"), "TEXT");
  assert.ok(hits.some(h => h.url === "https://graph.threads.com/v1.0/123/threads_publish"));
});
test("Threads text limits prevent any network calls", async () => {
  const hits = mocked(() => ({})); await assert.rejects(threads.publish({ text: "x".repeat(501) }, cred), /500/); assert.equal(hits.length, 0);
});
test("Pinterest carousel sends all images as multiple_image_base64", async () => {
  const hits = mocked(() => ({ id: "555" })); await pinterest.publish(carousel, cred);
  const body = JSON.parse(String(hits[0].init.body)); assert.equal(body.media_source.source_type, "multiple_image_base64"); assert.equal(body.media_source.items.length, 2); assert.equal(body.board_id, "123");
});
test("Pinterest rejects a carousel above five slides without truncation", async () => {
  const hits = mocked(() => ({})); await assert.rejects(pinterest.publish({ text: "Post", images: Array(6).fill(image) }, cred), /2–5/); assert.equal(hits.length, 0);
});
test("Telegraph sanitizes article HTML and keeps readable content and images", () => {
  const nodes = telegraphContent('<h1>Title</h1><p>Hello <strong>world</strong></p><script>bad()</script><img src="https://juicerai.ru/image" onerror="bad()">');
  const value = JSON.stringify(nodes); assert.match(value, /Title/); assert.match(value, /strong/); assert.match(value, /https:\/\/juicerai.ru\/image/); assert.doesNotMatch(value, /bad|script|onerror/);
});
test("Telegraph publishes ordered images and requires confirmed page URL", async () => {
  const hits = mocked(() => ({ ok: true, result: { path: "Post-11-25", url: "https://telegra.ph/Post-11-25" } }));
  const out = await telegraph.publish(carousel, { token: "secret", target: "Author" });
  assert.equal(out.externalId, "Post-11-25");
  const content = JSON.parse(String(hits[0].init.body)).content;
  assert.equal(content[1].children[0].attrs.src, carousel.imageUrls[0]); assert.equal(content[2].children[0].attrs.src, carousel.imageUrls[1]);
});
test("No API error echoes tokens or webhook URLs", async () => {
  mocked(() => new Response(JSON.stringify({ error: { code: 190, message: "secret-token https://discord.com/api/webhooks/1/secret" } }), { status: 403 }));
  await assert.rejects(api("Meta", "https://graph.facebook.com/test"), e => e instanceof PublishError && !e.message.includes("secret-token") && !e.message.includes("webhooks"));
});
test("Ambiguous final publishing network failure is not automatically retried", async () => {
  globalThis.fetch = async () => { throw new Error("network secret-token"); };
  await assert.rejects(api("Meta", "https://graph.facebook.com/test", { method: "POST" }, true), e => e instanceof PublishError && !e.retryable && !e.message.includes("secret-token"));
});
test("API rate limit can be retried and empty success is not an external ID", async () => {
  mocked(() => new Response("{}", { status: 429 })); await assert.rejects(api("Meta", "https://graph.facebook.com/test", {}, true), e => e instanceof PublishError && e.retryable);
  mocked(() => ({})); await assert.rejects(discord.publish({ text: "Post" }, { target: "https://discord.com/api/webhooks/1/token" }), /идентификатор/);
});
const connCred = { target: "https://workflow.example/publish", account: "brand-channel", token: "connector-secret" };
const ack = { ok: true, platform: "dzen", account: connCred.account, capabilities: ["text", "image", "carousel", "article"] };
test("Connector signs requests, sends all images and uses stable publication ID", async () => {
  const calls: Record<string, unknown>[] = [];
  const p = connector("dzen", async (_, o) => {
    const body = String(o.body), j = JSON.parse(body); calls.push(j);
    assert.equal(o.headers?.["X-Signature"], `sha256=${createHmac("sha256", connCred.token).update(`${o.headers?.["X-Timestamp"]}.${body}`).digest("hex")}`);
    return { status: 200, text: JSON.stringify(j.event === "integration.verify" ? ack : { ...ack, status: "published", publication_id: j.publication_id, id: "real-post", url: "https://dzen.ru/a/real-post" }) };
  });
  const out = await p.publish({ ...carousel, publicationId: "stable-id" }, connCred);
  assert.equal(out.externalId, "real-post"); assert.equal(calls[1].publication_id, "stable-id"); assert.equal((calls[1].images as unknown[]).length, 2);
});
test("Connector refuses generic 200, queued, wrong account and wrong publication ID", async () => {
  for (const result of [{}, { ...ack, status: "queued" }, { ...ack, account: "other" }, { ...ack, status: "published", publication_id: "other", id: "1", url: "https://dzen.ru/a/1" }]) {
    const p = connector("dzen", async (_, o) => ({ status: 200, text: JSON.stringify(JSON.parse(String(o.body)).event === "integration.verify" ? ack : result) }));
    await assert.rejects(p.publish({ text: "Post", publicationId: "stable-id" }, connCred), /не подтвердил/);
  }
});
test("Video connector without compatible capability cannot pretend to publish a text post", async () => {
  let sends = 0;
  const p = connector("youtube", async () => { sends++; return { status: 200, text: JSON.stringify({ ...ack, platform: "youtube", capabilities: ["video"] }) }; });
  await assert.rejects(p.publish({ text: "Post", publicationId: "stable-id" }, connCred), /не поддерживает/); assert.equal(sends, 1);
});
test("Connector verifies HTTPS and destination before sending", async () => {
  let sends = 0; const p = connector("dzen", async () => { sends++; return { status: 200, text: "{}" }; });
  await assert.rejects(p.verify({ ...connCred, target: "http://workflow.example" }), /HTTPS/); assert.equal(sends, 0);
});
test("Public URLs must cover every image", () => { assert.throws(() => mediaUrls({ ...carousel, imageUrls: [] }), /каждого/); });
test("Database migration accepts every configured platform and keeps legacy kinds", async () => {
  const { PGlite } = await import("@electric-sql/pglite"); const db = new PGlite();
  try {
    await db.exec("create table kz_channels(kind text constraint kz_channels_kind_check check(kind in ('telegram'))) ");
    await db.exec(readFileSync(new URL("../db/041_publishing_platforms.sql", import.meta.url), "utf8"));
    for (const kind of ["telegram", "vk", "wordpress", "max", "webhook", "site", ...Object.keys(DIRECT_CHANNELS), ...Object.keys(CONNECTOR_CHANNELS)]) await db.query("insert into kz_channels(kind) values($1)", [kind]);
    await assert.rejects(db.query("insert into kz_channels(kind) values('unknown')"));
  } finally { await db.close(); }
});
test("New direct providers verify access without publishing test content", async () => {
  for (const provider of [discord, telegraph, facebook, instagram, threads, pinterest]) {
    const hits = mocked(() => ({ id: "123", name: "Channel", username: "user", category: "Business", channel_id: "456", ok: true, result: { short_name: "Author" } }));
    await provider.verify(provider.kind === "discord" ? { target: "https://discord.com/api/webhooks/1/token" } : cred);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].init.method || "GET", provider.kind === "telegraph" ? "POST" : "GET");
    assert.doesNotMatch(hits[0].url, /createPage|\/feed$|\/media$|threads_publish|\/pins$/);
  }
});
