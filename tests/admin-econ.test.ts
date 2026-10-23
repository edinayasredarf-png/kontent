import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

/** Экономика: учёт расходов на нейросети, цены администратора, безлимит на срок. БД: TEST_DATABASE_URL с применённой db/adminer-schema.sql. */
const URL_ = process.env.TEST_DATABASE_URL;
const skipDb = !URL_ && "нет TEST_DATABASE_URL";

describe("причины списания → действия", () => {
  it("известные причины попадают в свои действия, неизвестные — в «прочее»", async () => {
    const { actionOf } = await import("../src/lib/billing");
    assert.equal(actionOf("Генерация: тема поста"), "generate");
    assert.equal(actionOf("Контент-план на 7 дн."), "plan");
    assert.equal(actionOf("Картинка к разделу: Этапы"), "image_section");
    assert.equal(actionOf("Картинка: тема"), "image");
    assert.equal(actionOf("Правка текста ИИ"), "edit");
    assert.equal(actionOf("Чат: ответ"), "chat");
    assert.equal(actionOf("Возврат: ошибка генерации"), "refund");
    assert.equal(actionOf("что-то новое"), "other");
  });
  it("стоимость вызова считается по прайсу: токены, картинки, вызов", async () => {
    const { callCost } = await import("../src/lib/billing");
    const p = { in: 100, out: 400, image: 250, call: 1 };
    assert.equal(callCost(p, { tokensIn: 1_000_000, tokensOut: 500_000, images: 0 }), 100 + 200 + 1);
    assert.equal(callCost(p, { tokensIn: 0, tokensOut: 0, images: 2 }), 501);
    assert.equal(callCost(undefined, { tokensIn: 5, tokensOut: 5, images: 1 }), 0, "нет прайса — 0");
  });
});

describe("в базе", { skip: skipDb }, () => {
  let org = "", user = "";
  const actor = { id: "", email: "admin@test.ru" };
  before(async () => {
    process.env.DATABASE_URL = URL_;
    const db = await import("../src/lib/db");
    org = (await db.one<{ id: string }>("insert into kz_orgs(name,balance_kop) values('econ-test',100000) returning id"))!.id;
    user = (await db.one<{ id: string }>("insert into kz_users(email,name,password_hash) values('econ-1@t.ru','Э','x') returning id"))!.id;
    await db.q("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [org, user]);
    actor.id = user;
  });
  after(async () => {
    const db = await import("../src/lib/db");
    await db.q("delete from kz_ai_usage where org_id=$1", [org]); await db.q("delete from kz_orgs where id=$1", [org]); await db.q("delete from kz_users where id=$1", [user]);
    await db.q("delete from kz_ai_models where model in ('test-model','no-price-model')"); await db.q("delete from kz_price_overrides");
  });

  it("цены администратора меняют PRICES на месте, возврат к умолчанию убирает переопределение", async () => {
    const { savePrices, resetPrices } = await import("../src/lib/admin-econ");
    const { PRICES, DEFAULT_PRICES, ensurePrices } = await import("../src/lib/wallet");
    const r = await savePrices(actor, { post: 2500, image: DEFAULT_PRICES.image });
    assert.ok(r.ok); assert.equal(PRICES.post, 2500); assert.equal(PRICES.image, DEFAULT_PRICES.image);
    PRICES.post = 1; await ensurePrices(true);
    assert.equal(PRICES.post, 2500, "после перечитывания из базы цена на месте");
    assert.equal((await savePrices(actor, { post: -5 }).catch((e: Error) => ({ ok: false, error: e.message }))).ok, false, "отрицательная цена отклоняется");
    await resetPrices(actor);
    assert.equal(PRICES.post, DEFAULT_PRICES.post);
  });

  it("цены на лендинге берутся из редактора: список, месяц и тексты с метками", async () => {
    const { savePrices, resetPrices } = await import("../src/lib/admin-econ");
    const { landingPrices, fill } = await import("../src/lib/landing-prices");
    await savePrices(actor, { post: 2500, carousel: 4000 });
    const L = await landingPrices();
    assert.equal(L.post, "≈ 25 ₽"); assert.equal(L.n_carousel, "40"); assert.equal(L.n_month, "1070", "30 постов по 25 ₽ и 8 каруселей по 40 ₽");
    assert.equal(fill("Пост стоит примерно %n_post% ₽, месяц около %n_month% ₽, %неизвестно%", L), "Пост стоит примерно 25 ₽, месяц около 1070 ₽, %неизвестно%");
    await resetPrices(actor);
    assert.equal((await landingPrices()).n_post, "20");
  });

  it("списание использует действующую цену, пишет действие; возврат учитывается отдельно", async () => {
    const { charge, refund, PRICES } = await import("../src/lib/wallet");
    const db = await import("../src/lib/db");
    await charge(org, PRICES.post, "Генерация: тема", undefined);
    await refund(org, 500, "ошибка генерации текста");
    const rows = await db.q<{ amount_kop: string; action: string }>("select amount_kop,action from kz_wallet_tx where org_id=$1 order by created_at", [org]);
    assert.deepEqual(rows.map((r) => [Number(r.amount_kop), r.action]), [[-PRICES.post, "generate"], [500, "refund"]]);
  });

  it("вызов нейросети записывается на организацию и действие из контекста, стоимость по прайсу модели", async () => {
    const { saveModelPrice, econByOrg, econByAction } = await import("../src/lib/admin-econ");
    const { recordUsage, setUsageCtx } = await import("../src/lib/billing");
    const db = await import("../src/lib/db");
    await saveModelPrice(actor, { model: "test-model", inM: 100, outM: 400, image: 0, call: 0 });
    setUsageCtx({ orgId: org, userId: user, reason: "Генерация: тема" });
    await recordUsage({ kind: "chat", task: "post", model: "test-model", tokensIn: 1_000_000, tokensOut: 250_000 });
    await recordUsage({ kind: "chat", task: "post", model: "no-price-model", tokensIn: 10, tokensOut: 10 });
    const rows = await econByOrg({ from: null, to: null });
    const mine = rows.find((r) => r.id === org)!;
    assert.equal(mine.cost, 20000, "миллион входных по 100 ₽ и 250 тыс. выходных по 400 ₽ = 200 ₽ = 20000 коп.; вызов без цены даёт 0");
    assert.equal(mine.calls, 2); assert.equal(mine.unpriced, 1);
    assert.ok(mine.charged > 0);
    const act = (await econByAction({ from: null, to: null }, org)).find((a) => a.action === "generate")!;
    assert.equal(act.calls, 2); assert.ok(act.charged > 0);
    // цену добавили позже: прошлые вызовы пересчитываются
    await saveModelPrice(actor, { model: "no-price-model", inM: 1_000_000, outM: 0, image: 0, call: 0 });
    const again = (await econByOrg({ from: null, to: null })).find((r) => r.id === org)!;
    assert.equal(again.unpriced, 0); assert.ok(again.cost > mine.cost);
    void db;
  });

  it("безлимит на срок: списаний нет, срок прибавляется, снимается нулём; «без вызовов» не ломает", async () => {
    const { setUnlimitedUntil } = await import("../src/lib/admin-econ");
    const { charge } = await import("../src/lib/wallet");
    const db = await import("../src/lib/db");
    const before = Number((await db.one<{ b: string }>("select balance_kop b from kz_orgs where id=$1", [org]))!.b);
    assert.ok((await setUnlimitedUntil(actor, org, 7)).ok);
    await charge(org, 5000, "Генерация: бесплатно");
    assert.equal(Number((await db.one<{ b: string }>("select balance_kop b from kz_orgs where id=$1", [org]))!.b), before, "баланс не тронут");
    const d1 = new Date((await db.one<{ u: string }>("select unlimited_until u from kz_orgs where id=$1", [org]))!.u).getTime();
    await setUnlimitedUntil(actor, org, 3);
    const d2 = new Date((await db.one<{ u: string }>("select unlimited_until u from kz_orgs where id=$1", [org]))!.u).getTime();
    assert.ok(Math.abs((d2 - d1) - 3 * 86_400_000) < 5000, "три дня добавились к семи");
    assert.ok((await setUnlimitedUntil(actor, org, 0)).ok);
    await charge(org, 5000, "Генерация: платно");
    assert.equal(Number((await db.one<{ b: string }>("select balance_kop b from kz_orgs where id=$1", [org]))!.b), before - 5000);
    assert.equal((await setUnlimitedUntil(actor, org, 1000)).ok, false);
    assert.equal((await setUnlimitedUntil(actor, "не-uuid", 5)).ok, false);
  });
});
