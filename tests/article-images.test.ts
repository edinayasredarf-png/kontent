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
  it("настройки завода: стиль, логотип, место и размер проходят проверку", async () => {
    const { cleanSettings } = await import("../src/lib/postsettings");
    const d = cleanSettings({});
    assert.deepEqual([d.imgStyle, d.imgLogo, d.imgLogoPos, d.imgLogoScale], ["", false, "br", 14]);
    const x = cleanSettings({ imgStyle: "photo", imgLogo: true, imgLogoPos: "tl", imgLogoScale: 99 });
    assert.deepEqual([x.imgStyle, x.imgLogo, x.imgLogoPos, x.imgLogoScale], ["photo", true, "tl", 40]);
    assert.equal(cleanSettings({ imgLogoPos: "zz", imgStyle: "<x>" }).imgLogoPos, "br");
    assert.equal(cleanSettings({ imgStyle: "<x>" }).imgStyle, "");
  });
  it("логотип накладывается в выбранный угол и не накладывается при «none»", async () => {
    const sharp = (await import("sharp")).default;
    const { finalizeImage } = await import("../src/lib/images");
    const raw = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const logoBuf = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const logo = { data: logoBuf } as never;
    const px = async (b: Buffer, x: number, y: number) => { const { data } = await sharp(b).raw().toBuffer({ resolveWithObject: true }); const o = (y * 400 + x) * 3; return [data[o], data[o + 1], data[o + 2]]; };
    const tl = await finalizeImage(raw, logo, { logoPos: "tl", logoScale: 20, logoMargin: 4 });
    const none = await finalizeImage(raw, logo, { logoPos: "none" });
    const [r, g] = await px(tl.data, 40, 40), [r2, g2] = await px(tl.data, 360, 360);
    assert.ok(r > 200 && g < 80, "в левом верхнем углу красный логотип");
    assert.ok(r2 > 200 && g2 > 200, "в правом нижнем углу пусто");
    const [r3, g3] = await px(none.data, 40, 40);
    assert.ok(r3 > 200 && g3 > 200, "none: логотипа нет");
  });
});
