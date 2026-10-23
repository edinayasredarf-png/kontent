import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { econByAction, econByDay, econByModel, econByOrg, econPnl } from "@/lib/admin-econ";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { bounds, parseRange, rangeLabel, type Preset } from "@/lib/range";
import { AdminNav } from "@/components/AdminNav";
import { FilterBar } from "@/components/FilterBar";
import { PageHead } from "@/components/ui";
import { rub } from "@/lib/wallet";
import { ActionTable } from "@/components/AdminActionTable";

const PRESETS: [Preset, string][] = [["today", "Сегодня"], ["yesterday", "Вчера"], ["7", "Неделя"], ["30", "Месяц"], ["all", "Всё время"]];
const k = (n: number) => rub(Math.round(n));
const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} млн` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} тыс` : String(n));
const pct = (m: number, rev: number) => (rev > 0 ? `${Math.round((m / rev) * 100)}%` : "—");

export default async function Economy({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const rg = parseRange(sp, [...PRESETS.map(([x]) => x), "custom"], "30");
  const b = bounds(rg);
  const [rows, byAction, byModel, pnl, days] = await Promise.all([econByOrg(b), econByAction(b, null), econByModel(b, null), econPnl(b), econByDay(b)]);
  const t = rows.reduce((a, r) => ({ rev: a.rev + r.charged - r.refunded, cost: a.cost + r.cost, calls: a.calls + r.calls, unpriced: a.unpriced + r.unpriced, tin: a.tin + r.tokensIn, tout: a.tout + r.tokensOut }), { rev: 0, cost: 0, calls: 0, unpriced: 0, tin: 0, tout: 0 });
  const margin = t.rev - t.cost;
  return (
    <>
      <PageHead title="Экономика" sub="Сколько клиенты платят за действия и сколько нам стоят нейросети AI Gateway. Выручка — списания с баланса за вычетом возвратов; затраты считаются по прайсу моделей." />
      <AdminNav active="/app/admin/economy" />
      <FilterBar path="/app/admin/economy" presets={PRESETS} r={rg.r} from={rg.from} to={rg.to} selects={[]} />
      <p className="-mt-2 mb-5 text-center text-xs text-ink3">Период: {rangeLabel(rg)}</p>
      <section className="card mb-6 p-5">
        <b className="mb-1 block text-sm">Заработали и потеряли за период</b>
        <p className="mb-4 text-xs text-ink2">Прибыль = списано с клиентов − вернули клиентам − затраты на нейросети − прочие расходы (сервер, домены и т. д., раздел «Расходы»).</p>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1.5 text-sm">
            {[["Списано с клиентов", pnl.charged, ""], ["Вернули клиентам (ошибки)", -pnl.refunded, "text-bad"], ["Выручка", pnl.revenue, "font-semibold"], ["Затраты на нейросети", -pnl.aiCost, ""], ["Маржа после нейросетей", pnl.gross, "font-semibold"], ["Прочие расходы", -pnl.expenses, ""]].map(([l, v, c]) => (
              <div key={String(l)} className={`flex justify-between border-b border-line pb-1.5 ${c}`}><span>{l}</span><span>{k(Number(v))}</span></div>))}
            <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-base font-semibold ${pnl.profit >= 0 ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}><span>{pnl.profit >= 0 ? "Прибыль" : "Убыток"}</span><span>{k(pnl.profit)}{pnl.revenue > 0 ? ` · ${Math.round((pnl.profit / pnl.revenue) * 100)}%` : ""}</span></div>
          </div>
          <div className="rounded-2xl bg-tile p-4 text-sm">
            <b className="mb-2 block text-xs font-semibold text-ink2">Потери: затраты на нейросети, которые не принесли денег</b>
            <div className="flex justify-between"><span>Бесплатный безлимит и тест</span><b>{k(pnl.lostFree)}</b></div>
            <div className="mt-1 flex justify-between"><span>Ошибки генерации (деньги вернули)</span><b>{k(pnl.lostRefunded)}</b></div>
            <div className="mt-1 flex justify-between border-t border-line pt-1.5"><span>Итого потеряли</span><b className="text-bad">{k(pnl.lostFree + pnl.lostRefunded)}</b></div>
            {Object.keys(pnl.expenseBy).length > 0 && <div className="mt-3 border-t border-line pt-2"><b className="mb-1 block text-xs font-semibold text-ink2">Прочие расходы по категориям</b>{Object.entries(pnl.expenseBy).map(([c, v]) => <div key={c} className="flex justify-between text-xs"><span>{EXPENSE_CATEGORIES[c]}</span><span>{k(v)}</span></div>)}</div>}
            <p className="mt-3 text-xs text-ink3">Потери считаются с момента применения миграции 028. Токены: вх. {tok(t.tin)} / исх. {tok(t.tout)}, вызовов {t.calls.toLocaleString("ru-RU")}.</p>
          </div>
        </div>
      </section>
      {t.unpriced > 0 && <p className="mb-5 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">У {t.unpriced.toLocaleString("ru-RU")} вызовов нет цены модели, поэтому их затраты посчитаны как 0. Заполните прайс на странице <Link href="/app/admin/prices" className="underline">«Цены»</Link>: уже записанные вызовы пересчитаются сами.</p>}

      <section className="card mb-6 overflow-x-auto">
        <div className="border-b border-line px-5 py-3 text-sm font-medium">По дням</div>
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs text-ink3"><th className="px-5 py-2 font-normal">День</th><th className="px-2 py-2 text-right font-normal">Выручка</th><th className="px-2 py-2 text-right font-normal">Нейросети</th><th className="px-2 py-2 text-right font-normal">Прочие расходы</th><th className="px-5 py-2 text-right font-normal">Прибыль</th></tr></thead>
          <tbody>
            {days.rows.map((r) => <tr key={r.day} className="border-t border-line"><td className="px-5 py-2">{new Date(`${r.day}T00:00:00Z`).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" })}</td><td className="px-2 py-2 text-right">{k(r.revenue)}</td><td className="px-2 py-2 text-right">{k(r.aiCost)}</td><td className="px-2 py-2 text-right">{k(r.expenses)}</td><td className={`px-5 py-2 text-right font-medium ${r.profit < 0 ? "text-bad" : "text-good"}`}>{k(r.profit)}</td></tr>)}
          </tbody>
        </table>
        {days.cut && <p className="border-t border-line px-5 py-2 text-xs text-ink3">Показаны последние 92 дня периода; итоги выше — за весь период.</p>}
      </section>

      <section className="card mb-6 overflow-x-auto">
        <div className="border-b border-line px-5 py-3 text-sm font-medium">По клиентам</div>
        <table className="w-full min-w-[820px] text-sm">
          <thead><tr className="text-left text-xs text-ink3"><th className="px-5 py-2 font-normal">Клиент</th><th className="px-2 py-2 text-right font-normal">Списано</th><th className="px-2 py-2 text-right font-normal">Затраты</th><th className="px-2 py-2 text-right font-normal">Маржа</th><th className="px-2 py-2 text-right font-normal">Вызовов</th><th className="px-2 py-2 text-right font-normal">Токены вх. / исх.</th><th className="px-5 py-2 text-right font-normal">Баланс</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-ink2">За этот период данных нет. Учёт расходов идёт с момента применения миграции 027.</td></tr>}
            {rows.map((r) => { const rev = r.charged - r.refunded, m = rev - r.cost; return (
              <tr key={r.id ?? "sys"} className="border-t border-line">
                <td className="px-5 py-2.5">{r.id ? <Link href={`/app/admin/economy/${r.id}?${new URLSearchParams({ r: rg.r, ...(rg.from ? { from: rg.from } : {}), ...(rg.to ? { to: rg.to } : {}) })}`} className="font-medium hover:underline">{r.name}</Link> : <span className="font-medium">{r.name}</span>}
                  <div className="text-xs text-ink3">{r.owner}{r.plan ? ` · ${r.plan}` : ""}{r.unlimited && <span className="chip ml-1.5">безлимит</span>}{r.until && <span className="chip ml-1.5 !bg-good-soft !text-good">пробный безлимит до {new Date(r.until).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>}</div></td>
                <td className="px-2 py-2.5 text-right">{k(rev)}</td><td className="px-2 py-2.5 text-right">{k(r.cost)}{r.unpriced > 0 && <span title="есть вызовы без цены модели" className="text-warn"> *</span>}</td>
                <td className={`px-2 py-2.5 text-right font-medium ${m < 0 ? "text-bad" : "text-good"}`}>{k(m)}<div className="text-xs font-normal text-ink3">{pct(m, rev)}</div></td>
                <td className="px-2 py-2.5 text-right">{r.calls.toLocaleString("ru-RU")}</td><td className="px-2 py-2.5 text-right text-xs">{tok(r.tokensIn)} / {tok(r.tokensOut)}{r.images > 0 && <div className="text-ink3">картинок: {r.images}</div>}</td>
                <td className="px-5 py-2.5 text-right text-xs text-ink2">{rub(r.balance)}</td></tr>); })}
          </tbody>
        </table>
      </section>

      <ActionTable rows={byAction} title="По действиям (вся платформа)" />
      <section className="card mb-6 overflow-x-auto">
        <div className="border-b border-line px-5 py-3 text-sm font-medium">По моделям</div>
        <table className="w-full min-w-[640px] text-sm"><thead><tr className="text-left text-xs text-ink3"><th className="px-5 py-2 font-normal">Модель</th><th className="px-2 py-2 text-right font-normal">Вызовов</th><th className="px-2 py-2 text-right font-normal">Токены вх. / исх.</th><th className="px-2 py-2 text-right font-normal">Картинок</th><th className="px-5 py-2 text-right font-normal">Затраты</th></tr></thead>
          <tbody>{byModel.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-ink2">Пока нет вызовов.</td></tr>}
            {byModel.map((m) => <tr key={m.model + m.kind} className="border-t border-line"><td className="px-5 py-2">{m.model || "—"}<span className="chip ml-2">{m.kind}</span>{!m.priced && <span className="chip ml-1 !bg-warn-soft !text-warn">нет цены</span>}</td><td className="px-2 py-2 text-right">{m.calls.toLocaleString("ru-RU")}</td><td className="px-2 py-2 text-right text-xs">{tok(m.tokensIn)} / {tok(m.tokensOut)}</td><td className="px-2 py-2 text-right">{m.images || "—"}</td><td className="px-5 py-2 text-right">{k(m.cost)}</td></tr>)}</tbody></table>
      </section>
    </>
  );
}
