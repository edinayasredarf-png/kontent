import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

/** Чат пишет материалы и показывает их: проверяем на подставной модели и настоящей базе. */
const skipDb = !process.env.TEST_DATABASE_URL && "нет TEST_DATABASE_URL";
let server: http.Server, org = "", user = "", factory = "", brand = "";
let script: (sys: string, user: string) => string = () => "";
let tid: string | null = null;

describe("чат: написать и изменить материал", { skip: skipDb }, () => {
  before(async () => {
    server = http.createServer((req, res) => { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => {
      const b = JSON.parse(Buffer.concat(c).toString() || "{}");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: script(String(b.messages?.[0]?.content ?? ""), String(b.messages?.[1]?.content ?? "")) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }));
    }); });
    await new Promise<void>((r) => server.listen(54411, r));
    process.env.SELFHOSTED_LLM_URL = "http://127.0.0.1:54411/v1"; process.env.SELFHOSTED_LLM_API_KEY = "x"; process.env.SELFHOSTED_LLM_MODEL = "mock";
    const { one, q } = await import("../src/lib/db");
    org = (await one<{ id: string }>("insert into kz_orgs(name,balance_kop,plan,unlimited) values('chat-test',500000,'start',true) returning id"))!.id;
    user = (await one<{ id: string }>("insert into kz_users(email,name,password_hash) values($1,'t','x') returning id", [`c-${org}@t.ru`]))!.id;
    await q("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [org, user]);
    brand = (await one<{ id: string }>("insert into kz_brands(org_id,name,description) values($1,'Бренд','Описание') returning id", [org]))!.id;
    factory = (await one<{ id: string }>("insert into kz_factories(org_id,brand_id,name,status) values($1,$2,'Завод','active') returning id", [org, brand]))!.id;
  });
  after(async () => {
    const { q } = await import("../src/lib/db");
    await q("delete from kz_orgs where id=$1", [org]); await q("delete from kz_users where id=$1", [user]);
    server.close();
  });

  it("кривой JSON от модели не доходит до человека, лишних карточек нет", async () => {
    const { askAgent, loadHistory } = await import("../src/lib/agent/agent");
    script = () => '{"final":{"text":"Вот ответ про «ёлочки» и "кавычки".\\n\\nВторой абзац.","links":[{"label":"Каналы","href":"/app/channels"}],"cards":[{"type":"channels"}]}}';
    const r = await askAgent({ orgId: org, userId: user, userName: "Тест", role: "owner" }, "что ты умеешь");
    assert.ok(r.ok);
    const m = (await loadHistory(org, user, 5)).filter((x) => x.role === "assistant").pop()!;
    assert.ok(!m.content.includes('"links"') && !m.content.includes("href") && !m.content.includes("{"), m.content);
    assert.ok(m.content.startsWith("Вот ответ"));
  });

  it("«напиши пост по теме» создаёт материал и показывает его карточкой в этом же ответе", async () => {
    const { askAgent, loadHistoryWithCards } = await import("../src/lib/agent/agent");
    script = (sys, usr) => {
      if (/Ты ассистент платформы/.test(sys)) {
        return /Вызван write/.test(usr) ? '{"final":{"text":"Написал пост. Могу сделать длиннее или добавить картинку.","cards":[{"type":"factory","id":"' + factory + '"}]}}'
          : '{"tool":"write","args":{"kind":"post","topic":"Запуск нового сервиса","instructions":"коротко и дружелюбно"}}';
      }
      return "Готовый текст поста про запуск сервиса.\n\nПодробности на сайте. #сервис";
    };
    const r = await askAgent({ orgId: org, userId: user, userName: "Тест", role: "owner" }, "напиши пост про запуск нового сервиса", [], tid);
    assert.ok(r.ok); tid = r.ok ? r.threadId ?? null : null;
    const m = (await loadHistoryWithCards(org, user, 5, tid)).filter((x) => x.role === "assistant").pop()!;
    const kinds = (m.cards ?? []).map((c) => c.t);
    assert.deepEqual(kinds, ["item"], "показан материал, карточка завода, которую модель добавила сама, отброшена: " + JSON.stringify(kinds));
    const it = (m.cards![0] as { items: { body: string; topic: string }[] }).items[0];
    assert.ok(it.body.includes("запуск сервиса"), it.body);
  });

  it("«сделай подлиннее» переписывает последний материал и снова показывает его", async () => {
    const { askAgent, loadHistoryWithCards } = await import("../src/lib/agent/agent");
    const { q } = await import("../src/lib/db");
    const item = (await q<{ id: string }>("select id from kz_content_items where org_id=$1 order by created_at desc limit 1", [org]))[0].id;
    script = (sys, usr) => {
      if (/Ты ассистент платформы/.test(sys)) {
        assert.ok(usr.includes(item), "последний материал передан модели");
        return /Вызван rewrite/.test(usr) ? '{"final":{"text":"Сделал подлиннее."}}' : `{"tool":"rewrite","args":{"itemId":"${item}","op":"expand"}}`;
      }
      return "Расширенный текст поста: больше деталей о запуске сервиса, примеры и польза для клиентов.";
    };
    const r = await askAgent({ orgId: org, userId: user, userName: "Тест", role: "owner" }, "сделай подлиннее", [], tid);
    assert.ok(r.ok);
    const m = (await loadHistoryWithCards(org, user, 5, tid)).filter((x) => x.role === "assistant").pop()!;
    assert.equal(m.content, "Сделал подлиннее.");
    assert.ok((m.cards![0] as { items: { body: string }[] }).items[0].body.startsWith("Расширенный текст"));
  });

  it("диалоги ищутся по тексту, версия материала возвращается", async () => {
    const { listThreads } = await import("../src/lib/agent/threads");
    const { listVersions, restoreVersion } = await import("../src/lib/versions");
    const { q } = await import("../src/lib/db");
    const all = await listThreads(org, user);
    assert.ok(all.length >= 1 && all.some((t) => t.id === tid), "диалог в списке");
    assert.equal((await listThreads(org, user, "подлиннее")).some((t) => t.id === tid), true, "поиск по тексту сообщения");
    assert.equal((await listThreads(org, user, "несуществующее-слово-xyz")).length, 0);
    const item = (await q<{ id: string; body: string }>("select id,body from kz_content_items where org_id=$1 order by created_at desc limit 1", [org]))[0];
    const vs = await listVersions(org, item.id);
    assert.ok(vs.length >= 1, "перед правкой текста сохранена версия");
    const r = await restoreVersion(org, item.id, vs[0].id);
    assert.ok(r.ok);
    const back = (await q<{ body: string }>("select body from kz_content_items where id=$1", [item.id]))[0].body;
    assert.ok(back.includes("запуск сервиса") && !back.startsWith("Расширенный"), back);
  });

  it("серия идёт в план, правило бренда запоминается и попадает в запрет, варианты применяются", async () => {
    const { runAct } = await import("../src/lib/agent/tools");
    const { q } = await import("../src/lib/db");
    const ctx = { orgId: org, role: "owner" };
    script = () => JSON.stringify([{ topic: "Идея 1", hook: "a", kind: "post" }, { topic: "Идея 2", hook: "b", kind: "post" }, { topic: "Идея 3", hook: "c", kind: "post" }]);
    const ser = await runAct(ctx, "series", { topic: "осень", days: 3 });
    assert.ok(ser.ok, ser.text);
    assert.equal(Number((await q<{ n: string }>("select count(*) n from kz_content_items where org_id=$1 and topic like 'Идея %'", [org]))[0].n), 3);
    const rem = await runAct(ctx, "remember", { rule: "не писать про цены", kind: "forbidden" });
    assert.ok(rem.ok);
    const rules = (await q<{ rules: { forbidden: string[] } }>("select rules from kz_brands where id=$1", [brand]))[0].rules;
    assert.ok(rules.forbidden.includes("не писать про цены"));
    const item = (await q<{ id: string }>("select id from kz_content_items where org_id=$1 and topic not like 'Идея %' order by created_at desc limit 1", [org]))[0].id;
    script = () => JSON.stringify(["Заголовок А", "Заголовок Б"]);
    const v = await runAct(ctx, "variants", { itemId: item, what: "headline", count: 2 });
    assert.ok(v.ok, v.text);
    const { applyVariant } = await import("../src/lib/agent/extras");
    assert.ok((await applyVariant(org, item, "headline", "Заголовок Б")).ok);
    assert.ok((await q<{ body: string }>("select body from kz_content_items where id=$1", [item]))[0].body.startsWith("Заголовок Б"));
  });

  it("наблюдателю платные действия не выполняются", async () => {
    const { runAct } = await import("../src/lib/agent/tools");
    const r = await runAct({ orgId: org, role: "viewer" }, "write", { kind: "post", topic: "x" });
    assert.equal(r.ok, false);
  });
});
