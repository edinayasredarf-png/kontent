import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

const poll = { question: "Как вы ведёте реестр?", options: ["Сами", "Подрядчики", "На бумаге"], mode: "options" as const };

describe("текст опроса для площадок", () => {
  it("Telegram с вариантами: только подводка (опрос уйдёт встроенным); остальные: вопрос и пронумерованные варианты", async () => {
    const { pollText } = await import("../src/lib/poll-format");
    assert.equal(pollText("Подводка", poll, "telegram"), "Подводка");
    const vk = pollText("Подводка", poll, "vk");
    assert.match(vk, /Как вы ведёте реестр\?\n\n1\. Сами\n2\. Подрядчики\n3\. На бумаге/);
    assert.match(vk, /напишите цифру/);
    assert.match(pollText("", { ...poll, multi: true }, "max"), /несколько вариантов/);
  });
  it("открытый вопрос: везде вопрос текстом и пометка про комментарии, без вариантов и цифр", async () => {
    const { pollText } = await import("../src/lib/poll-format");
    for (const k of ["telegram", "vk", "max"]) {
      const t = pollText("Подводка", { question: "Что мешает?", options: [], mode: "open" }, k);
      assert.equal(t, "Подводка\n\nЧто мешает?\n\nОтветы — в комментариях.");
    }
  });
  it("опрос без вопроса остаётся обычным текстом", async () => {
    const { pollText } = await import("../src/lib/poll-format");
    assert.equal(pollText("Просто текст", undefined, "vk"), "Просто текст");
  });
});

describe("Telegram: встроенный опрос", () => {
  const hits: { method: string; body: string }[] = [];
  let srv: http.Server;
  before(async () => {
    srv = http.createServer((req, res) => { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => { hits.push({ method: req.url!.split("/").pop()!, body: Buffer.concat(c).toString() }); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ok: true, result: { message_id: hits.length } })); }); });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });
  after(() => { srv.closeAllConnections?.(); srv.close(); });
  it("подводка и опрос; несколько ответов включаются флагом, по умолчанию один ответ", async () => {
    const { telegram } = await import("../src/lib/publishing/telegram");
    hits.length = 0;
    await telegram.publish({ text: "Подводка", poll: { question: "Вопрос?", options: ["А", "Б"] } }, { token: "T", target: "@c" });
    assert.deepEqual(hits.map((h) => h.method), ["sendMessage", "sendPoll"]);
    assert.equal(JSON.parse(hits[1].body).allows_multiple_answers, undefined);
    hits.length = 0;
    await telegram.publish({ text: "", poll: { question: "Вопрос?", options: ["А", "Б"], multi: true } }, { token: "T", target: "@c" });
    assert.deepEqual(hits.map((h) => h.method), ["sendPoll"]);
    assert.equal(JSON.parse(hits[0].body).allows_multiple_answers, true);
  });
});

describe("генерация опроса по выбранному режиму", () => {
  let srv: http.Server; let lastUser = ""; let reply = "";
  before(async () => {
    srv = http.createServer((req, res) => { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => { try { lastUser = JSON.parse(Buffer.concat(c).toString()).messages.at(-1).content; } catch { /* нет */ } res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { content: reply } }] })); }); });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    process.env.SELFHOSTED_LLM_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`; process.env.SELFHOSTED_LLM_MODEL = "m"; process.env.AUTH_SECRET = "s";
  });
  after(() => { srv.closeAllConnections?.(); srv.close(); });
  const args = async () => { const { cleanSettings } = await import("../src/lib/postsettings"); return [{ name: "Б", description: "", audience: "", tone: "professional", forbidden: [] as string[] }, "продукт", "ниша", "тема", "хук", cleanSettings({})] as [import("../src/lib/ai").BrandCtx, string, string, string, string, ReturnType<typeof cleanSettings>]; };

  it("с вариантами: просит ровно N вариантов и возвращает их", async () => {
    const { genPoll } = await import("../src/lib/ai");
    reply = '{"question":"Как решаете?","options":["А","Б","В"],"caption":"Подводка"}';
    const [b, p, n, t, h, st] = await args();
    const r = await genPoll(b, p, n, t, h, st, undefined, { mode: "options", count: 3 });
    assert.deepEqual(r.options, ["А", "Б", "В"]);
    assert.match(lastUser, /ровно 3 вариантов/);
  });
  it("открытый вопрос: вариантов нет, в запросе нет требования к вариантам, пустой массив принимается", async () => {
    const { genPoll } = await import("../src/lib/ai");
    reply = '{"question":"Что мешает вести реестр?","options":[],"caption":"Подводка"}';
    const [b, p, n, t, h, st] = await args();
    const r = await genPoll(b, p, n, t, h, st, undefined, { mode: "open" });
    assert.deepEqual([r.question, r.options], ["Что мешает вести реестр?", []]);
    assert.match(lastUser, /открытый вопрос без вариантов/);
  });
  it("с вариантами, но модель дала один вариант — ошибка, а не опрос из одного пункта", async () => {
    const { genPoll } = await import("../src/lib/ai");
    reply = '{"question":"Вопрос","options":["Один"],"caption":"x"}';
    const [b, p, n, t, h, st] = await args();
    await assert.rejects(genPoll(b, p, n, t, h, st, undefined, { mode: "options", count: 4 }), /не вернула опрос|меньше двух/);
  });
});
