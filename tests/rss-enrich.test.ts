import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { one, q } from "../src/lib/db";
import { enrichItem, bestText } from "../src/lib/monitor/news";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
let org = "", source = "", id = "", server: http.Server, requests = 0;
const prose = "Городской проект проходит общественное обсуждение. Специалисты подготовили план работ и опубликовали материалы для жителей. ".repeat(4);

describe("trusted article selection", () => {
  it("ignores legacy page dumps and accepts a cleaned article even if it is shorter than the RSS excerpt", () => {
    const item = { title: "Тема", body: "Анонс из RSS", full_text: "Меню и мусор".repeat(100) };
    assert.equal(bestText({ ...item, full_status: "ok" }), item.body);
    assert.equal(bestText({ ...item, body: prose, full_text: "Чистый текст", full_status: "article-v2" }), "Чистый текст");
  });
});

describe("article enrichment and repair", { skip: !url && "нет TEST_DATABASE_URL" }, () => {
  before(async () => {
    process.env.ALLOW_PRIVATE_FETCH = "1";
    server = http.createServer((req, res) => {
      requests++;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (req.url === "/missing") return res.end('<html><nav>Меню сайта</nav><form>Вход</form><div class="cookie-banner">Принять cookie</div></html>');
      res.end(`<html><head><title>Статья</title></head><body><nav>Меню сайта</nav><article><h1>Статья</h1><p>${prose}</p><img src="/article.jpg" width="900" height="600"></article><footer>Контакты</footer></body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    org = (await one<{ id: string }>("insert into kz_orgs(name) values('rss repair test') returning id"))!.id;
    source = (await one<{ id: string }>("insert into kz_sources(org_id,kind,ref,title) values($1,'site','test-rss','RSS') returning id", [org]))!.id;
    id = (await one<{ id: string }>("insert into kz_feed_items(org_id,source_id,ext_id,url,title,body,published_at,full_text,full_status,status) values($1,$2,'rss-test',$3,'Статья','Анонс',now(),'Меню сайта и посторонние блоки','ok','saved') returning id", [org, source, `http://127.0.0.1:${(server.address() as AddressInfo).port}/article`]))!.id;
  });
  after(async () => { if (org) await q("delete from kz_orgs where id=$1", [org]); if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });
  it("repairs old stored text and saves article images without changing its saved status", async () => {
    assert.equal((await enrichItem(org, id)).ok, true);
    const row = (await one<{ full_text: string; full_status: string; status: string; media: { url: string }[] }>("select full_text,full_status,status,media from kz_feed_items where id=$1", [id]))!;
    assert.equal(row.full_status, "article-v2"); assert.equal(row.status, "saved");
    assert.equal(row.full_text, prose.trim()); assert.doesNotMatch(row.full_text, /Меню|Контакты/);
    assert.match(row.media[0].url, /\/article.jpg$/);
  });
  it("uses the versioned cache and supports explicit re-reading", async () => {
    const n = requests;
    await enrichItem(org, id); assert.equal(requests, n);
    await enrichItem(org, id, true); assert.equal(requests, n + 1);
  });
  it("does not expose legacy junk when a page has no article", async () => {
    await q("update kz_feed_items set url=replace(url,'/article','/missing'),full_text='Старое меню',full_status='ok' where id=$1", [id]);
    assert.equal((await enrichItem(org, id)).ok, false);
    const row = (await one<{ full_text: string | null; full_status: string }>("select full_text,full_status from kz_feed_items where id=$1", [id]))!;
    assert.equal(row.full_text, null); assert.equal(row.full_status, "article-v2:short");
  });
  it("cannot read or modify a news item from another organization", async () => {
    assert.equal((await enrichItem(randomUUID(), id)).ok, false);
  });
});
