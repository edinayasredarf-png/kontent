import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

/** Прайс и логи Timeweb: сопоставление моделей шлюза с прайсом, разбор CSV логов. БД: TEST_DATABASE_URL. */
const URL_ = process.env.TEST_DATABASE_URL;
const skipDb = !URL_ && "нет TEST_DATABASE_URL";

const CSV = `﻿Дата и время;ID запроса;API-ключ;Модель запроса;Модель ответа;Причина завершения;HTTP-код;Стриминг;Входящие токены;Исходящие токены;Токены кэша;Стоимость входящих;Стоимость исходящих;Стоимость кэша;Итоговая стоимость;Валюта;Задержка, мс;TTFT, мс;Скорость, токенов/сек
23.10.2026 09:44:44;a;Контент завод;anthropic/claude-sonnet-5;anthropic/claude-sonnet-5;Успешный ответ;200;Нет;567;224;0;0.229635;0.4536;0;0.683235;RUB;3909;;57.3
23.10.2026 09:44:39;b;Контент завод;anthropic/claude-sonnet-5;anthropic/claude-sonnet-5;Успешный ответ;200;Нет;1000;500;0;0.405;1.0125;0;1.4175;RUB;3000;;50
23.10.2026 09:40:00;c;Контент завод;anthropic/claude-sonnet-4-5;anthropic/claude-sonnet-4-5;Ошибка;401;Нет;0;0;0;0;0;0;0;RUB;10;;
23.10.2026 09:30:00;d;Контент завод;openai/gpt-5.6-luna;openai/gpt-5.6-luna;Успешный ответ;200;Нет;2000;100;0;0.054;0.0162;0;0.0702;RUB;900;;40`;

describe("сопоставление моделей шлюза с прайсом Timeweb", () => {
  it("совпадения по набору слов: версии через дефис, регистр, провайдер", async () => {
    const { priceForModel } = await import("../src/lib/timeweb-prices");
    const p = (id: string) => priceForModel(id).price;
    assert.deepEqual([p("anthropic/claude-sonnet-5")!.in, p("anthropic/claude-sonnet-5")!.out], [405, 2025]);
    assert.deepEqual([p("anthropic/claude-haiku-4-5")!.in, p("anthropic/claude-haiku-4-5")!.out], [135, 1080], "4-5 и 4.5 — одно");
    assert.deepEqual([p("openai/gpt-image-2.5-flare")!.in, p("openai/gpt-image-2.5-flare")!.out], [675, 4050]);
    assert.equal(p("black-forest-labs/flux.2-pro")!.image, 4.05);
    assert.equal(p("OpenAI/GPT-5.6-Luna")!.out, 162);
    assert.equal(priceForModel("anthropic/claude-sonnet-4-5").price, null, "нет в прайсе — не подставляем чужую");
    assert.deepEqual(priceForModel("zai/glm-5.2"), { price: null, ambiguous: true }, "две цены у названия — выбор вручную");
    assert.equal(priceForModel("openai/gpt-6").price, null, "не путает близкие названия");
  });
});

describe("логи Timeweb", () => {
  it("разбор CSV: даты по Москве, ошибки отдельно, ставки за 1 млн из фактической стоимости", async () => {
    const { parseTimewebLogs, summarizeLogs } = await import("../src/lib/timeweb-logs");
    const rows = parseTimewebLogs(CSV);
    assert.equal(rows.length, 4);
    assert.equal(rows[0].at!.toISOString(), "2026-10-23T06:44:44.000Z");
    const s = summarizeLogs(rows);
    const sonnet = s.find((m) => m.model === "anthropic/claude-sonnet-5")!;
    assert.equal(sonnet.calls, 2); assert.equal(Math.round(sonnet.rateIn), 405); assert.equal(Math.round(sonnet.rateOut), 2025);
    assert.ok(Math.abs(sonnet.cost - 2.100735) < 1e-6);
    const bad = s.find((m) => m.model === "anthropic/claude-sonnet-4-5")!;
    assert.deepEqual([bad.calls, bad.failed], [0, 1]);
    assert.equal(Math.round(s.find((m) => m.model === "openai/gpt-5.6-luna")!.rateOut), 162);
    assert.throws(() => parseTimewebLogs("a;b\n1;2"), /не похоже на выгрузку/);
  });
});

describe("в базе", { skip: skipDb }, () => {
  const actor = { id: "", email: "a@t.ru" };
  before(async () => { process.env.DATABASE_URL = URL_; const db = await import("../src/lib/db"); actor.id = (await db.one<{ id: string }>("insert into kz_users(email,name,password_hash) values('tw-1@t.ru','Т','x') returning id"))!.id; });
  after(async () => { const db = await import("../src/lib/db"); await db.q("delete from kz_ai_models where model like 'tw/%' or model like 'anthropic/%' or model like 'openai/%' or model like 'zai/%'"); await db.q("delete from kz_users where id=$1", [actor.id]); });

  it("«Подтянуть модели»: новые добавляются с ценой, неоднозначные и неизвестные — пустыми, заполненные не трогаются", async () => {
    const { addGatewayModels } = await import("../src/lib/timeweb-prices");
    const db = await import("../src/lib/db");
    await db.q("insert into kz_ai_models(model,in_per_m_kop,out_per_m_kop) values('anthropic/claude-haiku-4-5',111,222)");
    const r = await addGatewayModels(actor, ["anthropic/claude-sonnet-5", "anthropic/claude-haiku-4-5", "zai/glm-5.2", "tw/unknown-model"]);
    assert.deepEqual([r.total, r.added, r.priced, r.kept], [4, 3, 1, 1]);
    assert.deepEqual(r.ambiguous, ["zai/glm-5.2"]); assert.deepEqual(r.unpriced, ["tw/unknown-model"]);
    const m = await db.one<{ i: string; o: string }>("select in_per_m_kop i,out_per_m_kop o from kz_ai_models where model='anthropic/claude-sonnet-5'");
    assert.deepEqual([Number(m!.i), Number(m!.o)], [40500, 202500], "405 ₽ и 2025 ₽ за 1 млн в копейках");
    const kept = await db.one<{ i: string }>("select in_per_m_kop i from kz_ai_models where model='anthropic/claude-haiku-4-5'");
    assert.equal(Number(kept!.i), 111, "ручная цена не перезаписана");
  });

  it("импорт логов: ставки для моделей без цены и сверка с нашим учётом", async () => {
    const { importTimewebLogs } = await import("../src/lib/timeweb-logs");
    const db = await import("../src/lib/db");
    await db.q("delete from kz_ai_models where model='openai/gpt-5.6-luna'");
    const r = await importTimewebLogs(actor, CSV);
    assert.equal(r.rows, 4); assert.ok(r.priced.includes("openai/gpt-5.6-luna"));
    assert.ok(!r.priced.includes("anthropic/claude-sonnet-5"), "у sonnet уже есть цена из прайса");
    const luna = await db.one<{ o: string }>("select out_per_m_kop o from kz_ai_models where model='openai/gpt-5.6-luna'");
    assert.equal(Math.round(Number(luna!.o)), 16200);
    assert.ok(Math.abs(r.total - (0.683235 + 1.4175 + 0.0702)) < 1e-6);
  });
});
