import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

const guide = (body: string) => ({ kind: "guide", topic: "Гайд", body, guide: { title: "Как провести инвентаризацию", subtitle: "Пошаговый гайд" } }) as never;

describe("PDF гайда", () => {
  it("собирается из HTML гайда: обложка и несколько страниц текста, метаданные, русский язык", async () => {
    const { pdfOf } = await import("../src/lib/pdf");
    const body = "<h2>Шаг 1</h2>" + "<p>Абзац текста гайда с кириллицей и цифрами 2026. </p>".repeat(120) + "<ul><li>Пункт</li></ul><blockquote>Цитата</blockquote>";
    const bytes = await pdfOf(guide(body), { name: "АИС «Единая среда»", color: "#1f4fff" });
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 3, `страниц: ${doc.getPageCount()}`);
    assert.equal(doc.getTitle(), "Как провести инвентаризацию");
    assert.equal(doc.getAuthor(), "АИС «Единая среда»");
  });
  it("эмодзи и неподдерживаемые символы пропускаются, а не ломают файл; пустое тело даёт одну обложку", async () => {
    const { pdfOf } = await import("../src/lib/pdf");
    const bytes = await pdfOf(guide("<p>Рост 🌳🔥 на 50% ✅</p>"), { name: "Бренд", color: "не цвет" });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
    const empty = await pdfOf(guide(""), { name: "Бренд", color: "#ffffff" });
    assert.ok((await PDFDocument.load(empty)).getPageCount() >= 1);
  });
  it("очень длинное слово без пробелов не выходит за поля и не зацикливается", async () => {
    const { pdfOf } = await import("../src/lib/pdf");
    const bytes = await pdfOf(guide(`<p>${"я".repeat(900)}</p>`), { name: "Б", color: "#029cda" });
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 2);
  });
});

describe("лид-магнит", () => {
  it("шаги получения подставляют кнопку, кодовое слово и площадку", async () => {
    const { leadSteps } = await import("../src/lib/lead-magnet");
    assert.match(leadSteps("email", "", "Скачать гайд", "")[0], /«Скачать гайд»/);
    const sub = leadSteps("subscribe", "КЛАДБИЩЕ", "", "канал «Единая среда»").join("\n");
    assert.match(sub, /канал «Единая среда»/); assert.match(sub, /«КЛАДБИЩЕ»/);
    assert.match(leadSteps("comment", "ГАЙД", "", "").join("\n"), /комментарий «ГАЙД»/);
    assert.equal(leadSteps("request", "", "Оставить заявку", "").length, 2);
  });
  it("для каждого способа есть подсказка владельцу, блок собирается в текст для копирования", async () => {
    const { MECHANICS, ownerTip, leadBlockText } = await import("../src/lib/lead-magnet");
    for (const m of Object.keys(MECHANICS)) assert.ok(ownerTip(m as never).length > 30, m);
    assert.equal(leadBlockText({ headline: "Заголовок", sub: "Подзаголовок", bullets: ["А", "Б"], button: "Скачать" }), "Заголовок\nПодзаголовок\n• А\n• Б\n[ Скачать ]");
  });
});
