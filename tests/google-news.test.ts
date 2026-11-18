import assert from "node:assert/strict";
import { test } from "node:test";
import { googleNewsResult, isGoogleNews, resolveGoogleNews } from "../src/lib/monitor/google-news";
import { articleNeedsLoading } from "../src/lib/monitor/article-state";

test("Google News framed response resolves the publisher and rejects unrelated or invalid URLs", () => {
  const frame = (url: string) => `)]}'\n\n123\n${JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", url]), null]])}\n`;
  assert.equal(googleNewsResult(frame("https://publisher.example/news/42")), "https://publisher.example/news/42");
  assert.equal(googleNewsResult(frame("javascript:alert(1)")), null);
  assert.equal(googleNewsResult(frame("https://news.google.com/article")), null);
  assert.equal(googleNewsResult("bad response"), null);
  assert.equal(isGoogleNews("https://news.google.com.evil.example/rss/articles/abc"), false);
});

test("legacy news links decode without downloading and previously unsupported search results retry", async () => {
  const url = "https://publisher.example/news/42";
  const id = Buffer.concat([Buffer.from([8, 19, 34, url.length]), Buffer.from(url), Buffer.from([210, 1, 0])]).toString("base64url");
  assert.equal(await resolveGoogleNews(`https://news.google.com/rss/articles/${id}`), url);
  assert.equal(await resolveGoogleNews(url), url);
  assert.equal(articleNeedsLoading("news", "unsupported", null), true);
  assert.equal(articleNeedsLoading("site", "unsupported", null), false);
});
