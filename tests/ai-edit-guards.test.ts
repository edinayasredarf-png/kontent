import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanModelText, runEdit, splitForEdit, type ChatFn } from "../src/lib/text-tools";

/** Быстрые ИИ-команды: проверки результата на сценариях «модель ответила плохо». Модель подменяется функцией. */
const script = (...answers: (string | ((user: string) => string))[]): { chat: ChatFn; calls: string[] } => {
  const calls: string[] = []; let i = 0;
  return { calls, chat: async (_s, user) => { calls.push(user); const a = answers[Math.min(i++, answers.length - 1)]; return typeof a === "function" ? a(user) : a; } };
};
const TEXT = "Мы запустили новый сервис для города и ждём отзывы жителей. Он помогает быстро находить проблемы на улицах и во дворах, а управляющим компаниям — планировать работы заранее. Подключиться можно за один день, без сложных настроек и долгих согласований.";

describe("очистка ответа модели", () => {
  it("убирает ограду, вводную фразу, рассуждения и кавычки вокруг всего текста", () => {
    assert.equal(cleanModelText("```\nТекст поста\n```"), "Текст поста");
    assert.equal(cleanModelText("Вот исправленный текст:\n\nПривет, мир"), "Привет, мир");
    assert.equal(cleanModelText("<think>думаю</think>Готово"), "Готово");
    assert.equal(cleanModelText("«Привет, мир»"), "Привет, мир");
    assert.equal(cleanModelText("«Привет» и «мир»"), "«Привет» и «мир»", "кавычки внутри не трогаем");
  });
});

describe("проверки результата", () => {
  it("исправление ошибок: полная переписка отклоняется, тот же текст с поправкой принимается", async () => {
    const bad = script("Представляем совершенно иное решение для муниципалитетов: делитесь мнением, подключайтесь, пробуйте!");
    const r = await runEdit(bad.chat, TEXT, "fix");
    assert.equal(r.ok, false); assert.equal(bad.calls.length, 2, "был один повтор строже");
    const good = await runEdit(script(TEXT.replace("ждём", "ждем")).chat, TEXT, "fix");
    assert.deepEqual(good, { ok: true, text: TEXT.replace("ждём", "ждем") });
  });
  it("сократить: если не стало короче — повтор; после второй неудачи ошибка", async () => {
    const ok = await runEdit(script(TEXT, "Запустили сервис для города: он находит проблемы и помогает планировать работы.").chat, TEXT, "shorten");
    assert.equal(ok.ok, true);
    assert.equal((await runEdit(script(TEXT).chat, TEXT, "shorten")).ok, false);
  });
  it("увеличить: короткий ответ отклоняется", async () => {
    assert.equal((await runEdit(script("Коротко.").chat, TEXT, "expand")).ok, false);
    assert.equal((await runEdit(script(`${TEXT} ${TEXT.slice(0, 120)} Это подтверждает практика.`).chat, TEXT, "expand")).ok, true);
  });
  it("цепляющее начало: правится только первая строка", async () => {
    const t = `Новый сервис для города\n${TEXT}`;
    assert.equal((await runEdit(script(`Что, если проблемы на улицах решаются за день?\n${TEXT}`).chat, t, "hook")).ok, true);
    assert.equal((await runEdit(script("Что, если проблемы решаются за день?\nСовсем другой текст, который не имеет отношения к исходному абзацу вообще, переписанный целиком.").chat, t, "hook")).ok, false);
  });
  it("ответ, обрезанный на середине, не принимается", async () => {
    assert.equal((await runEdit(script(TEXT.slice(0, 60)).chat, TEXT, "polish")).ok, false);
  });
  it("своя команда принимает любой разумный ответ; слишком длинному тексту отказ", async () => {
    assert.equal((await runEdit(script(`${TEXT} Запишитесь на демонстрацию.`).chat, TEXT, "custom", "добавь призыв записаться")).ok, true);
    const r = await runEdit(script("x").chat, "а".repeat(10_000), "custom", "перепиши");
    assert.equal(r.ok, false);
    assert.equal((await runEdit(script("x").chat, TEXT, "custom", "")).ok, false, "без команды");
  });
});

describe("HTML-статьи", () => {
  const HTML = '<h2>Заголовок</h2><p>Первый абзац статьи с ошибкой в слове.</p><figure><img src="/api/assets/1" alt="a"></figure><p>Второй абзац со <a href="https://x.ru">ссылкой</a> на сайт.</p>';
  it("потерянная картинка или ссылка — отказ, целая разметка — принимается", async () => {
    assert.equal((await runEdit(script(HTML.replace(/<figure>.*?<\/figure>/, "")).chat, HTML, "polish")).ok, false);
    assert.equal((await runEdit(script(HTML.replace("ошибкой", "ошибкою")).chat, HTML, "fix")).ok, true);
  });
  it("в запросе к модели сказано сохранить разметку", async () => {
    let system = "";
    await runEdit(async (sys) => { system = sys; return HTML; }, HTML, "polish");
    assert.match(system, /сохрани все теги/);
    let plain = "";
    await runEdit(async (sys) => { plain = sys; return TEXT; }, TEXT, "polish");
    assert.doesNotMatch(plain, /HTML/);
  });
  it("длинная статья правится по частям, картинки и порядок целы", async () => {
    const block = (n: number) => `<h2>Раздел ${n}</h2><p>${"Текст раздела с ошибкой. ".repeat(60)}</p><figure><img src="/api/assets/${n}" alt=""></figure>`;
    const long = [1, 2, 3, 4, 5].map(block).join("");
    assert.ok(long.length > 6000);
    const chunks = splitForEdit(long, true);
    assert.ok(chunks.length >= 2 && chunks.join("") === long, "куски склеиваются обратно без потерь");
    const r = await runEdit(script((u) => u.split("<<<\n")[1].split("\n>>>")[0].replaceAll("ошибкой", "ошибкою")).chat, long, "fix");
    assert.equal(r.ok, true);
    if (r.ok) { assert.equal((r.text.match(/<img/g) ?? []).length, 5); assert.ok(r.text.includes("ошибкою") && !r.text.includes("ошибкой")); }
  });
  it("на длинной статье «цепляющее начало» меняет только первый кусок", async () => {
    const long = [1, 2, 3, 4].map((n) => `<h2>Раздел ${n}</h2><p>${"Содержательный текст абзаца. ".repeat(70)}</p>`).join("");
    const s = script((u) => u.split("<<<\n")[1].split("\n>>>")[0].replace("Раздел 1", "Раздел 1: неожиданно"));
    const r = await runEdit(s.chat, long, "hook");
    assert.equal(s.calls.length, 1);
    assert.ok(r.ok && r.text.includes("Раздел 4") && r.text.includes("неожиданно"));
  });
});

describe("текст поста от модели", () => {
  it("markdown и вводные фразы убираются, хештеги и абзацы остаются", async () => {
    const { cleanPostText } = await import("../src/lib/ai");
    assert.equal(cleanPostText("Вот текст поста:\n\n**Важно:** новый сервис\n\n#город #сервис"), "Важно: новый сервис\n\n#город #сервис");
    assert.equal(cleanPostText("## Заголовок\nТекст"), "Заголовок\nТекст");
    assert.equal(cleanPostText("## Раздел\nТекст", true), "## Раздел\nТекст", "у лонгрида заголовки сохраняются");
    assert.equal(cleanPostText("```\nТекст\n```"), "Текст");
  });
});
