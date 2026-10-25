import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

/**
 * Сквозной прогон обучения на ПОДСТАВНОЙ моделью: она отвечает по сценарию, а тест проверяет то, что делаем мы:
 * что модель видит в каждом ходе (инструкции, прогресс, уже сохранённое, историю) и что реально сохраняется в базе.
 */
const skipDb = !process.env.TEST_DATABASE_URL && "нет TEST_DATABASE_URL";
let server: http.Server, org = "", user = "", tid: string | null = null;
const seen: { sys: string; usr: string }[] = [];
let plan: (turn: number, usr: string) => string = () => "";

describe("обучение: что видит модель и что запоминается", { skip: skipDb }, () => {
  before(async () => {
    server = http.createServer((req, res) => { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => {
      const b = JSON.parse(Buffer.concat(c).toString() || "{}");
      const sys = String(b.messages?.[0]?.content ?? ""), usr = String(b.messages?.[1]?.content ?? "");
      if (/Ты ассистент платформы/.test(sys)) seen.push({ sys, usr });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: /Ты ассистент платформы/.test(sys) ? plan(seen.length, usr) : "Готовый текст." } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }));
    }); });
    await new Promise<void>((r) => server.listen(54412, r));
    process.env.SELFHOSTED_LLM_URL = "http://127.0.0.1:54412/v1"; process.env.SELFHOSTED_LLM_API_KEY = "x"; process.env.SELFHOSTED_LLM_MODEL = "mock";
    const { one, q } = await import("../src/lib/db");
    org = (await one<{ id: string }>("insert into kz_orgs(name,balance_kop,plan,unlimited) values('flow',500000,'start',true) returning id"))!.id;
    user = (await one<{ id: string }>("insert into kz_users(email,name,password_hash) values($1,'Анна','x') returning id", [`f-${org}@t.ru`]))!.id;
    await q("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [org, user]);
  });
  after(async () => { const { q } = await import("../src/lib/db"); await q("delete from kz_orgs where id=$1", [org]); await q("delete from kz_users where id=$1", [user]); server.close(); });

  it("инструкции обучения и прогресс попадают в запрос модели с первого хода", async () => {
    const { startOnboarding } = await import("../src/lib/agent/onboarding");
    const { askAgent } = await import("../src/lib/agent/agent");
    tid = await startOnboarding(org, user);
    plan = () => '{"final":{"text":"Расскажите, для кого вы работаете?","replies":["Для частных клиентов","Для компаний"]}}';
    const r = await askAgent({ orgId: org, userId: user, userName: "Анна", role: "owner" }, "Мы кофейня, обжариваем зёрна, сайт coffee.example", [], tid);
    assert.ok(r.ok);
    const s = seen[0];
    for (const must of ["ОБУЧЕНИЕ НОВОГО КЛИЕНТА", "ПРАВИЛА ВЕДЕНИЯ", "Бренд:", "Брендбук:", "Контент-завод:", "Каналы:", "Мониторинг:", "Первый материал:", "connect_channel", "save_factory", "add_source", "suggest_keywords"]) assert.ok(s.sys.includes(must), `в инструкции нет: ${must}`);
    assert.ok(s.usr.includes("Прогресс настройки (0 из 6)") && s.usr.includes("УЖЕ СОХРАНЕНО В СЕРВИСЕ") && s.usr.includes("ничего"), s.usr.slice(0, 400));
    for (const key of ["Бренд:", "Брендбук:", "Контент-завод:", "Каналы публикации", "Мониторинг новостей", "Первый материал"]) assert.ok(s.usr.includes(key), `в прогрессе нет шага: ${key}`);
  });

  it("сохранённое сразу попадает в память модели на следующем ходу, история передаётся, кнопки-ответы сохраняются", async () => {
    const { askAgent, loadHistory } = await import("../src/lib/agent/agent");
    let step = 0;
    plan = (_n, usr) => {
      step++;
      if (step === 1) return '{"tool":"save_brand","args":{"name":"Кофейня «Зерно»","description":"Обжариваем и продаём кофе в зёрнах","audience":"Офисы и ценители кофе","tone":"тёплый, без пафоса","forbidden":["скидки навсегда"],"competitors":["Coffee Co"]}}';
      if (step === 2) return '{"final":{"text":"Записал бренд. Теперь про логотип: пришлите файл.","cards":[{"type":"setup"}],"replies":["Прикреплю логотип","Пока пропустить"]}}';
      // следующий ход: проверяем память
      assert.ok(usr.includes("Кофейня «Зерно»") && usr.includes("тёплый, без пафоса") && usr.includes("скидки навсегда") && usr.includes("Coffee Co"), "сохранённый бренд не виден модели:\n" + usr.slice(0, 900));
      assert.ok(usr.includes("Мы кофейня, обжариваем зёрна"), "прежний ответ клиента потерян из истории");
      return '{"final":{"text":"Хорошо, продолжим с заводом.","replies":["Да"]}}';
    };
    const r1 = await askAgent({ orgId: org, userId: user, userName: "Анна", role: "owner" }, "Для офисов и ценителей кофе, тон тёплый, конкурент Coffee Co, не писать про скидки навсегда", [], tid);
    assert.ok(r1.ok);
    const last = (await loadHistory(org, user, 3, tid)).filter((m) => m.role === "assistant").pop()!;
    assert.deepEqual(last.blocks.replies, ["Прикреплю логотип", "Пока пропустить"]);
    assert.ok(last.blocks.cards?.some((c) => c.t === "setup"), "после сохранения показана карточка прогресса");
    const r2 = await askAgent({ orgId: org, userId: user, userName: "Анна", role: "owner" }, "Давай дальше", [], tid);
    assert.ok(r2.ok);
    assert.ok(step >= 3, "третий ход проверил память");
  });

  it("завод, источники, слова сохраняются целиком и видны на следующем ходу", async () => {
    const { runAct } = await import("../src/lib/agent/tools");
    const { progressText } = await import("../src/lib/agent/onboarding");
    const { one } = await import("../src/lib/db");
    const brandId = (await one<{ id: string }>("select id from kz_brands where org_id=$1", [org]))!.id;
    const ctx = { orgId: org, role: "owner", userId: user };
    const f = await runAct(ctx, "save_factory", { brandId, name: "Соцсети кофейни", niche: "кофе и обжарка", product: "Кофе в зёрнах, подписка на доставку", formats: ["post", "carousel", "seo"], days: [2, 4, 6], times: ["09:30", "18:00"], approval: "manual", autopublish: false, images: true, length: "short", cta: "Закажите первую пачку", link: "https://coffee.example" });
    assert.ok(f.ok, f.text);
    assert.ok((await runAct(ctx, "add_keywords", { include: ["обжарка кофе", "кофе в зёрнах"], exclude: ["вакансии"] })).ok);
    const t = await progressText(org);
    for (const must of ["Соцсети кофейни", "кофе и обжарка", "post, carousel, seo", "дни 2,4,6", "09:30,18:00", "одобрение: manual", "автопубликация: нет", "картинки: да", "Закажите первую пачку", "https://coffee.example", "ключевых слов: 2"]) assert.ok(t.includes(must), `не запомнилось или не видно модели: ${must}\n${t}`);
  });
});
