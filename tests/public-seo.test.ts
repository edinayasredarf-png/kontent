import test from "node:test";
import assert from "node:assert/strict";
import sitemap from "../src/app/sitemap";
import { PRODUCT_PAGES } from "../src/lib/marketing-content";
import { jsonLdText, publicMetadata } from "../src/lib/public-seo";
import { SITE } from "../src/lib/site";

test("public sitemap includes all guides and excludes authentication and private routes", () => {
  const entries = sitemap();
  for (const page of PRODUCT_PAGES) {
    const path = `/vozmozhnosti/${page.slug}`;
    assert.ok(entries.some(entry => entry.url === `${SITE}${path}`));
    const meta = publicMetadata(page.title, page.description, path);
    assert.equal(meta.alternates?.canonical, path);
    assert.equal((meta.robots as { index: boolean }).index, true);
    assert.ok(page.sections.length >= 4);
  }
  assert.ok(entries.every(entry => !/\/(login|register|app|api)(\/|$)/.test(entry.url)));
  assert.equal(new Set(entries.map(entry => entry.url)).size, entries.length);
});

test("structured data cannot terminate its script element", () => {
  const text = jsonLdText({ text: "</script><script>alert(1)</script>" });
  assert.ok(!text.includes("<"));
  assert.deepEqual(JSON.parse(text), { text: "</script><script>alert(1)</script>" });
});
