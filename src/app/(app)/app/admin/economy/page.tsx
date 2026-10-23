import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { econByAction, econByModel, econByOrg } from "@/lib/admin-econ";
import { bounds, parseRange, rangeLabel, type Preset } from "@/lib/range";
import { AdminNav } from "@/components/AdminNav";
import { FilterBar } from "@/components/FilterBar";
import { PageHead } from "@/components/ui";
import { rub } from "@/lib/wallet";
import { ActionTable } from "@/components/AdminActionTable";

const PRESETS: [Preset, string][] = [["today", "Сегодня"], ["7", "7 дней"], ["30", "30 дней"], ["all", "Всё время"]];
const k = (n: number) => rub(Math.round(n));
const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} млн` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} тыс` : String(n));
const pct = (m: number, rev: number) => (rev > 0 ? `${Math.round((m / rev) * 100)}%` : "—");

export default async function Economy({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const rg = parseRange(sp, [...PRESETS.map(([x]) => x), "custom"], "30");
  const b = bounds(rg);
  const [rows, byAction, byModel] = await Promise.all([econByOrg(b), econByAction(b, null), econByModel(b, null)]);
  const t = rows.reduce((a, r) => ({ rev: a.rev + r.charged - r.refunded, cost: a.cost + r.cost, calls: a.calls + r.calls, unpriced: a.unpriced + r.unpriced, tin: a.tin + r.tokensIn, tout: a.tout + r.tokensOut }), { rev: 0, cost: 0, calls: 0, unpriced: 0, tin: 0, tout: 0 });
  const margin = t.rev - t.cost;
  return (
    <>
      <PageHead title="Экономика" sub="Сколько клиенты платят за действия и сколько нам стоят нейросети AI Gateway. Выручка — списания с баланса за вычетом возвратов; затраты считаются по прайсу моделей." />
      <AdminNav active="/app/admin/economy" />
      <FilterBar path="/app/admin/economy" presets={PRESETS} r={rg.r} from={rg.from} to={rg.to} selects={[]} />
      <p className="-mt-2 mb-5 text-center text-xs text-ink3">Период: {rangeLabel(rg)}</p>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["Списано с клиентов", k(t.rev)], ["Затраты на нейросети", k(t.cost)], ["Маржа", `${k(margin)} · ${pct(margin, t.rev)}`], ["Вызовов нейросетей", t.calls.toLocaleString("ru-RU")], ["Токены", `${tok(t.tin)} / ${tok(t.tout)}`]].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-tile p-5"><div className="mb-1 text-sm text-ink2">{l}</div><div className={`text-xl font-semibold ${l === "Маржа" && margin < 0 ? "text-bad" : ""}`}>{v}</div></div>))}
      </div>
      {t.unpriced > 0 && <p className="mb-5 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">У {t.unpriced.toLocaleString("ru-RU")} вызовов нет цены модели, поэтому их затраты посчитаны как 0. Заполните прайс на странице <Link href="/app/admin/prices" className="underline">«Цены»</Link>: уже записанные вызовы пересчитаются сами.</p>}

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
