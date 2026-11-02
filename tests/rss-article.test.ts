import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractArticle } from "../src/lib/article";
import { cleanArticleFragment } from "../src/lib/article-content";
import { parseFeed } from "../src/lib/monitor/parse";
import { decodeFetchedText } from "../src/lib/safefetch";

const base = "https://example.org/news/123/";
const p = "Редакция рассказала о новом городском проекте. В следующем месяце специалисты начнут подготовку площадки, а затем проведут открытое обсуждение с жителями. ";
const page = (body: string) => `<html><head><title>Заголовок статьи | Издание</title></head><body><header>Логотип</header><div class="nav-menu">Разделы сайта</div><aside>${p.repeat(8)}</aside>${body}<div class="cookie-consent"><p>Принять условия и войти</p></div><footer>Подписаться и контакты</footer></body></html>`;
const rss = (content: string) => `<rss><channel><item><title>Заголовок</title><link>${base}</link><description>${content}</description><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;

describe("article reader", () => {
  it("extracts an article and its lazy images without navigation, ads, share buttons or giant gaps", async () => {
    const result = await extractArticle(page(`<article><h1>Заголовок статьи</h1><div class="article-body"><p>${p}</p><div class="ad-slot">Купить подписку</div><div class="social-share"><a>Поделиться</a></div><p>Второй <strong>важный</strong> абзац.</p><img src="/pixel.gif" data-src="/images/photo.jpg" width="900" height="600"><img src="/logo.png" width="180" height="100"><div style="display: none">Скрытый блок</div><div class="related-posts">Читайте также: другие материалы</div></div></article>`), base);
    assert.ok(result);
    assert.equal(result.title, "Заголовок статьи");
    assert.equal(result.text, `${p.trim()}\n\nВторой важный абзац.`);
    assert.deepEqual(result.media.map((m) => m.url), ["https://example.org/images/photo.jpg"]);
    assert.doesNotMatch(result.text, /Купить|Разделы|Поделиться|Скрытый|другие материалы|\n{3}/);
  });
  it("keeps a short attachment-only article instead of selecting the longer sidebar", async () => {
    const result = await extractArticle(page('<h1>Документ</h1><div class="text-block"><div><p>Документ временно доступен в виде прикрепленного <a href="/files/document.pdf">файла</a>.</p></div></div>'), base);
    assert.ok(result);
    assert.equal(result.text, "Документ временно доступен в виде прикрепленного файла.");
    assert.deepEqual(result.media, [{ type: "file", url: "https://example.org/files/document.pdf", name: "Документ (PDF)" }]);
  });
  it("uses reader mode for pages without article-specific classes", async () => {
    const result = await extractArticle(page(`<main><h1>Заголовок статьи</h1><div><p>${p.repeat(3)}</p><p>${p.repeat(2)}</p></div></main>`), base);
    assert.ok(result && result.text.includes(p.trim()));
    assert.doesNotMatch(result.text, /Разделы|Принять|Контакты/);
  });
  it("does not turn a menu, login or cookie consent into an article", async () => {
    assert.equal(await extractArticle(page('<nav><a>Правовые консультации</a><a>Аналитические статьи</a></nav><form><p>Войти в аккаунт</p></form>'), base), null);
  });
  it("preserves punctuation, paragraphs and lists and rejects non-http image/file URLs", () => {
    const result = cleanArticleFragment('<p>Очень <b>важно</b>, сохранить переносы.</p><p>Другой абзац.</p><ul><li>Один</li><li>Два</li></ul><img src="javascript:alert(1)"><img src="data:image/png;base64,AA"><a href="javascript:file.pdf">Файл</a>', base);
    assert.match(result.text, /важно, сохранить/);
    assert.match(result.text, /переносы\.\n\nДругой/);
    assert.match(result.text, /• Один/);
    assert.equal(result.media.length, 0);
  });
});

describe("RSS and Atom content", () => {
  it("parses CDATA HTML before stripping tags and preserves paragraphs and all article images", () => {
    const [item] = parseFeed(rss('<![CDATA[<p>Первый <b>абзац</b>.</p><p>Второй &amp; третий.</p><img src="/one.jpg"><img data-src="/two.jpg">]]>'), base);
    assert.equal(item.body, "Первый абзац.\n\nВторой & третий.");
    assert.deepEqual(item.media?.map((m) => m.url), ["https://example.org/one.jpg", "https://example.org/two.jpg"]);
  });
  it("decodes XML-escaped HTML and leaves literal text entities intact", () => {
    const [escaped] = parseFeed(rss('&lt;p&gt;Первый&lt;/p&gt;&lt;p&gt;Второй&lt;/p&gt;'), base);
    assert.equal(escaped.body, "Первый\n\nВторой");
    const [literal] = parseFeed(rss('<![CDATA[<p>Показать &lt;пример&gt; 😀</p>]]>'), base);
    assert.equal(literal.body, "Показать <пример> 😀");
    const [fallback] = parseFeed(rss("<![CDATA[<p>Анонс</p>]]>").replace("<description>", "<content:encoded><![CDATA[]]></content:encoded><description>"), base);
    assert.equal(fallback.body, "Анонс");
  });
  it("retains paragraph breaks in plain-text RSS and does not clip full content at 4000", () => {
    const text = `${p}\n\n${p.repeat(35)}`;
    const [item] = parseFeed(rss(`<![CDATA[${text}]]>`), base);
    assert.ok(item.body.length > 4000); assert.ok(item.body.includes("\n\n"));
  });
  it("chooses Atom alternate links, resolves relative images and rejects javascript links", () => {
    const xml = `<feed><entry><title>Atom</title><link rel="self" href="https://example.org/api/1"/><link rel="alternate" href="/news/1"/><content type="html">&lt;p&gt;Текст статьи&lt;/p&gt;&lt;img src="photo.jpg"&gt;</content></entry></feed>`;
    const [item] = parseFeed(xml, base);
    assert.equal(item.url, "https://example.org/news/1");
    assert.equal(item.media?.[0].url, "https://example.org/news/photo.jpg");
    assert.equal(parseFeed(rss("Текст").replace(base, "javascript:alert(1)"), base).length, 0);
  });
});

describe("legacy news encodings", () => {
  it("recognizes Windows-1251 from XML and HTML declarations when the HTTP header has no charset", () => {
    const bytes = Buffer.from([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2]);
    assert.match(decodeFetchedText(Buffer.concat([Buffer.from('<?xml version="1.0" encoding="windows-1251"?>'), bytes]), "application/xml"), /Привет/);
    assert.match(decodeFetchedText(Buffer.concat([Buffer.from('<meta charset="windows-1251">'), bytes]), "text/html"), /Привет/);
    assert.equal(decodeFetchedText(Buffer.from("Привет 😀"), "text/plain; charset=utf-8"), "Привет 😀");
  });
});
