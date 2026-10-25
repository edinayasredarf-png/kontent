import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanReply, parseReply, redactSecrets } from "../src/lib/agent/agent";
import { normKind } from "../src/lib/agent/writer";

describe("разбор ответа ассистента", () => {
  it("обычный JSON", () => {
    const o = parseReply('{"final":{"text":"Готово","links":[{"label":"Календарь","href":"/app/calendar"}]}}');
    assert.equal(o?.final?.text, "Готово");
  });
  it("перенос строки внутри текста не ломает разбор", () => {
    const o = parseReply('{"final":{"text":"Первая строка\n\nВторая строка","cards":[{"type":"channels"}]}}');
    assert.equal(o?.final?.text, "Первая строка\n\nВторая строка");
  });
  it("неэкранированные кавычки: текст достаётся, хвост из JSON не попадает к человеку", () => {
    const raw = '{"final":{"text":"Лучше всего подходит новость про "умные" остановки.\\n\\nСоздание поста — платно.","links":[{"label":"Открыть мониторинг новостей","href":"/app/monitor"}],"cards":[{"type":"channels"}]}}';
    const o = parseReply(raw);
    assert.ok(o?.final);
    const t = cleanReply(o!.final!.text);
    assert.ok(!t.includes('"links"') && !t.includes("href"), t);
    assert.ok(t.startsWith("Лучше всего подходит новость"));
  });
  it("вызов инструмента", () => {
    const o = parseReply('```json\n{"tool":"write","args":{"kind":"seo","url":"https://example.ru/a"}}\n```');
    assert.equal(o?.tool, "write"); assert.equal((o?.args as { kind: string }).kind, "seo");
  });
  it("cleanReply убирает литеральные \\n и остатки JSON", () => {
    assert.equal(cleanReply('Абзац один\\n\\nАбзац два","links":[{"label":"x","href":"/app"}]}}'), "Абзац один\n\nАбзац два");
  });
  it("форматы: слова пользователя сводятся к ключам", () => {
    assert.equal(normKind("SEO-статья"), "seo"); assert.equal(normKind("статья"), "article"); assert.equal(normKind("карусель"), "carousel");
    assert.equal(normKind(undefined), "post"); assert.equal(normKind("post"), "post");
  });
  it("токены, присланные сообщением, вырезаются до сохранения и до нейросети", () => {
    const t = redactSecrets("вот токен 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw9 и vk1.a.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 подключи");
    assert.ok(!t.includes("AAHdq") && !t.includes("vk1.a.AbCd"), t);
    assert.ok(t.startsWith("вот токен [токен скрыт]"));
    assert.equal(redactSecrets("Напиши пост про кофе 2026"), "Напиши пост про кофе 2026");
  });
});
