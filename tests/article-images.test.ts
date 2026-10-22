import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("картинки к разделам статьи", () => {
  const html = "<h2>Один</h2><p>а</p><h2>Два</h2><p>б</p>";
  it("картинка вставляется сразу после нужного H2, остальной текст не меняется", async () => {
    const { insertAfterH2 } = await import("../src/lib/article-lib");
    const out = insertAfterH2(html, 1, '<figure><img src="/api/assets/x" alt="Два"></figure>')!;
    assert.match(out, /<h2>Два<\/h2>\n<figure><img src="\/api\/assets\/x" alt="Два"><\/figure><p>б<\/p>/);
    assert.ok(out.startsWith("<h2>Один</h2><p>а</p>"));
    assert.equal(insertAfterH2(html, 5, "<figure></figure>"), null, "несуществующий раздел");
  });
  it("повторная вставка заменяет прежнюю картинку раздела, а не добавляет вторую", async () => {
    const { insertAfterH2 } = await import("../src/lib/article-lib");
    const a = insertAfterH2(html, 0, '<figure><img src="/api/assets/old" alt="a"></figure>')!;
    const b = insertAfterH2(a, 0, '<figure><img src="/api/assets/new" alt="a"></figure>')!;
    assert.equal((b.match(/<figure>/g) ?? []).length, 1);
    assert.ok(b.includes("/api/assets/new") && !b.includes("/api/assets/old"));
  });
  it("для публикации на сайт закрытые ссылки на картинки заменяются подписанными публичными", async () => {
    process.env.AUTH_SECRET = "s"; process.env.APP_URL = "https://app.example";
    const { publicizeImages } = await import("../src/lib/pub-image");
    const id = "11111111-1111-1111-1111-111111111111";
    const out = publicizeImages(`<img src="/api/assets/${id}" alt="">`);
    assert.match(out, new RegExp(`src="https://app\\.example/api/pub/${id}\\?s=[0-9a-f]{32}"`));
    delete process.env.APP_URL;
    assert.equal(publicizeImages(`<img src="/api/assets/${id}">`), `<img src="/api/assets/${id}">`, "без APP_URL остаётся как есть");
  });
});
