import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

const skipDb = !process.env.TEST_DATABASE_URL && "нет TEST_DATABASE_URL";
let org = "", user = "";

describe("обучение нового клиента в чате", { skip: skipDb }, () => {
  before(async () => {
    const { one, q } = await import("../src/lib/db");
    org = (await one<{ id: string }>("insert into kz_orgs(name,plan,unlimited) values('onb','start',true) returning id"))!.id;
    user = (await one<{ id: string }>("insert into kz_users(email,name,password_hash) values($1,'t','x') returning id", [`o-${org}@t.ru`]))!.id;
    await q("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [org, user]);
  });
  after(async () => { const { q } = await import("../src/lib/db"); await q("delete from kz_orgs where id=$1", [org]); await q("delete from kz_users where id=$1", [user]); });

  it("приветствие создаёт диалог «Знакомство» с чек-листом и кнопками", async () => {
    const { startOnboarding, ONBOARDING_TITLE } = await import("../src/lib/agent/onboarding");
    const { loadHistoryWithCards } = await import("../src/lib/agent/agent");
    const { listThreads } = await import("../src/lib/agent/threads");
    const t = await startOnboarding(org, user);
    assert.ok(t);
    assert.equal((await listThreads(org, user))[0].title, ONBOARDING_TITLE);
    const m = (await loadHistoryWithCards(org, user, 5, t))[0];
    assert.ok(m.blocks.replies?.includes("Пропустить обучение"));
    const card = m.cards?.[0] as { t: string; steps: { done: boolean }[] };
    assert.equal(card.t, "setup"); assert.equal(card.steps.length, 6); assert.equal(card.steps.filter((s) => s.done).length, 0);
  });

  it("бренд, слова и документ двигают прогресс; обучение завершается", async () => {
    const { runAct } = await import("../src/lib/agent/tools");
    const { progress } = await import("../src/lib/agent/onboarding");
    const { saveAsset } = await import("../src/lib/assets");
    const ctx = { orgId: org, role: "owner", userId: user };
    const b = await runAct(ctx, "save_brand", { name: "Кофейня", description: "Обжариваем и продаём кофе в зёрнах", audience: "Ценители кофе, офисы", tone: "тёплый" });
    assert.ok(b.ok, b.text);
    const brandId = (b.refs![0] as { id: string }).id;
    const k = await runAct(ctx, "add_keywords", { include: ["кофе", "обжарка"], exclude: ["вакансии"] });
    assert.ok(k.ok, k.text);
    const doc = await saveAsset(org, null, "generated", "о компании.txt", { data: Buffer.from("Мы обжариваем кофе с 2015 года. ".repeat(10)), mime: "text/plain", width: 0, height: 0 }, "вложение чата");
    const d = await runAct(ctx, "add_to_kb", { fileId: doc, kind: "company", brandId });
    assert.ok(d.ok, d.text);
    const f = await runAct(ctx, "save_factory", { brandId, name: "Соцсети", niche: "кофе", product: "Кофе в зёрнах с доставкой по России", formats: ["post", "carousel"], days: [1, 3, 5], times: ["10:00"], approval: "manual", autopublish: false, images: true });
    assert.ok(f.ok, f.text);
    const st = await progress(org);
    const done = Object.fromEntries(st.map((s) => [s.key, s.done]));
    assert.equal(done.brand, true); assert.equal(done.style, true); assert.equal(done.factory, true);
    assert.equal(done.channels, false); assert.equal(done.first, false);
    const fin = await runAct(ctx, "finish_onboarding", {});
    assert.ok(fin.ok);
    const { listThreads } = await import("../src/lib/agent/threads");
    assert.equal((await listThreads(org, user))[0].title, "Настройка завершена");
  });

  it("форма подключения канала показывается в чате только владельцу и админу", async () => {
    const { runAct } = await import("../src/lib/agent/tools");
    const { hydrateCards } = await import("../src/lib/agent/cards");
    const ok = await runAct({ orgId: org, role: "owner", userId: user }, "connect_channel", { kind: "vk" });
    assert.ok(ok.ok);
    const card = (await hydrateCards(org, ok.refs))[0] as { t: string; kind: string; brands: unknown[] };
    assert.equal(card.t, "channel_form"); assert.equal(card.kind, "vk"); assert.ok(card.brands.length >= 1);
    assert.equal((await runAct({ orgId: org, role: "editor", userId: user }, "connect_channel", { kind: "vk" })).ok, false);
  });
});
