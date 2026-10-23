import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

/** (при совместном запуске с другими файлами на одной базе запускать с --test-concurrency=1: итоги общие на всю платформу)
 * Расходы и прибыль: размазывание ежемесячных расходов по дням, потери, итог периода. БД: TEST_DATABASE_URL. */
const URL_ = process.env.TEST_DATABASE_URL;
const skipDb = !URL_ && "нет TEST_DATABASE_URL";
const E = (o: Partial<import("../src/lib/expenses").Expense>) => ({ id: "x", title: "t", category: "server", amount_kop: 0, spent_on: "2026-10-01", recurring: "once" as const, end_on: null, note: "", ...o });

describe("расходы по дням", () => {
  it("разовый — в день оплаты; ежемесячный — равными долями по дням месяца", async () => {
    const { expensesByDay, expenseTotals } = await import("../src/lib/expenses");
    const list = [E({ amount_kop: 5000, spent_on: "2026-10-10" }), E({ amount_kop: 310000, spent_on: "2026-10-01", recurring: "monthly", category: "service" })];
    const m = expensesByDay(list, "2026-10-09", "2026-10-11");
    assert.equal(m.get("2026-10-10"), 5000 + 10000, "разовый 50 ₽ + доля ежемесячного 3100/31 = 100 ₽");
    assert.equal(m.get("2026-10-09"), 10000);
    const t = expenseTotals(list, "2026-10-01", "2026-10-31");
    assert.equal(Math.round(t.total), 5000 + 310000); assert.equal(Math.round(t.byCategory.service), 310000);
  });
  it("ежемесячный расход не действует до даты начала и после окончания", async () => {
    const { expensesByDay } = await import("../src/lib/expenses");
    const list = [E({ amount_kop: 300000, spent_on: "2026-10-15", recurring: "monthly", end_on: "2026-10-20" })];
    const m = expensesByDay(list, "2026-10-01", "2026-10-31");
    assert.deepEqual([...m.keys()].sort()[0], "2026-10-15"); assert.equal(m.size, 6, "с 15 по 20 включительно");
    assert.equal(expensesByDay(list, "2026-11-01", "2026-11-30").size, 0);
  });
  it("добавление проверяет данные", async () => {
    const { addExpense } = await import("../src/lib/expenses");
    const a = { id: "", email: "a@t.ru" };
    assert.equal((await addExpense(a, { title: "x", category: "server", rub: 10, date: "2026-10-01", recurring: "once" })).ok, false, "короткое название");
    assert.equal((await addExpense(a, { title: "Сервер", category: "server", rub: -5, date: "2026-10-01", recurring: "once" })).ok, false);
    assert.equal((await addExpense(a, { title: "Сервер", category: "server", rub: 5, date: "завтра", recurring: "once" })).ok, false);
    assert.equal((await addExpense(a, { title: "Сервер", category: "server", rub: 5, date: "2026-10-10", recurring: "monthly", endOn: "2026-10-01" })).ok, false);
  });
});

describe("прибыль и потери в базе", { skip: skipDb }, () => {
  let org = "", user = "";
  const actor = { id: "", email: "p@t.ru" };
  before(async () => {
    process.env.DATABASE_URL = URL_;
    const db = await import("../src/lib/db");
    org = (await db.one<{ id: string }>("insert into kz_orgs(name,balance_kop) values('pnl-test',500000) returning id"))!.id;
    user = (await db.one<{ id: string }>("insert into kz_users(email,name,password_hash) values('pnl-1@t.ru','П','x') returning id"))!.id;
    actor.id = user;
    await db.q("insert into kz_memberships(org_id,user_id,role) values($1,$2,'owner')", [org, user]);
  });
  after(async () => {
    const db = await import("../src/lib/db");
    await db.q("delete from kz_ai_usage where org_id=$1", [org]); await db.q("delete from kz_expenses where title like 'pnl-%'"); await db.q("delete from kz_orgs where id=$1", [org]); await db.q("delete from kz_users where id=$1", [user]);
    await db.q("delete from kz_ai_models where model='pnl-model'");
  });

  it("потери: вызовы после бесплатного списания и после возврата помечаются, обычные нет", async () => {
    const { charge, refund } = await import("../src/lib/wallet");
    const { recordUsage, setUsageCtx } = await import("../src/lib/billing");
    const { saveModelPrice, setUnlimitedUntil, econPnl } = await import("../src/lib/admin-econ");
    const db = await import("../src/lib/db");
    await saveModelPrice(actor, { model: "pnl-model", inM: 1_000_000, outM: 0, image: 0, call: 0 }); // 1 токен = 100 коп.
    const ref = "00000000-0000-0000-0000-00000000aaaa";
    // 1) обычная платная операция с успешным результатом
    setUsageCtx({ orgId: org, userId: user, free: false });
    await charge(org, 2000, "Генерация: обычная", ref);
    await recordUsage({ kind: "chat", task: "post", model: "pnl-model", tokensIn: 10, tokensOut: 0 }); // 1000 коп.
    // 2) платная операция, которая не удалась и вернулась
    const ref2 = "00000000-0000-0000-0000-00000000bbbb";
    await charge(org, 2000, "Генерация: ошибка", ref2);
    await recordUsage({ kind: "chat", task: "post", model: "pnl-model", tokensIn: 20, tokensOut: 0 }); // 2000 коп.
    await refund(org, 2000, "ошибка генерации текста", ref2);
    // 3) бесплатный безлимит
    await setUnlimitedUntil(actor, org, 3);
    await charge(org, 2000, "Генерация: бесплатно");
    await recordUsage({ kind: "chat", task: "post", model: "pnl-model", tokensIn: 30, tokensOut: 0 }); // 3000 коп.
    const p = await econPnl({ from: null, to: null });
assert.ok(p.aiCost >= 6000 && p.lostRefunded >= 2000 && p.lostFree >= 3000);
    const rows = await db.q<{ no_revenue: string | null; tokens_in: number }>("select no_revenue,tokens_in from kz_ai_usage where org_id=$1 order by tokens_in", [org]);
    assert.deepEqual(rows.map((r) => r.no_revenue), [null, "refunded", "free"]);
  });

  it("итог периода: выручка − возвраты − нейросети − расходы = прибыль; по дням складывается в то же", async () => {
    const { addExpense } = await import("../src/lib/expenses");
    const { econPnl, econByDay } = await import("../src/lib/admin-econ");
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    await addExpense(actor, { title: "pnl-сервер", category: "server", rub: 62, date: today, recurring: "once" });
    const p = await econPnl({ from: null, to: null });
    assert.equal(Math.round(p.profit), Math.round(p.revenue - p.aiCost - p.expenses));
    assert.ok(p.expenses >= 6200);
    const d = await econByDay({ from: null, to: null });
    const sum = d.rows.reduce((a, r) => a + r.profit, 0);
    assert.ok(Math.abs(sum - p.profit) < 1, "по дням в сумме те же деньги");
  });
});
