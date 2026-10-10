import { Compass, Sparkles } from "lucide-react";
import { genStrategyAction, saveStrategyAction } from "@/lib/growth-actions";
import type { Strategy } from "@/lib/strategy";
import { PRICES, rub } from "@/lib/wallet";

interface Matrix { weeks: string[]; rows: { name: string; counts: number[]; total: number }[]; untagged: number[] }

/** Контент-стратегия завода: позиционирование, боли аудитории, рубрики с долями и матрица плана на 4 недели. */
export function StrategyCard({ factoryId, strategy, matrix, free }: { factoryId: string; strategy: Strategy | null; matrix: Matrix | null; free: boolean }) {
  const slots = Array.from({ length: 8 }, (_, i) => strategy?.rubrics[i] ?? { name: "", share: 0, desc: "" });
  const maxShare = Math.max(1, ...(strategy?.rubrics.map((r) => r.share) ?? [1]));
  return (
    <details className="card mb-4 p-4" open={!strategy}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><Compass size={15} />Контент-стратегия и рубрики{strategy ? <span className="chip">{strategy.rubrics.length} рубрик</span> : <span className="chip !bg-warn-soft !text-warn">не составлена</span>}</summary>
      <div className="mt-4 space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-tile p-3">
          <p className="min-w-[14rem] flex-1 text-xs text-ink2">ИИ составит рубрики и доли по описанию бренда, лучшим вашим постам и тому, что заходит у конкурентов. План и тексты будут опираться на рубрики.</p>
          <form action={genStrategyAction}><input type="hidden" name="factory" value={factoryId} /><button className="btn"><Sparkles size={14} />{strategy ? "Составить заново" : "Составить стратегию"}{free ? "" : ` · ${rub(PRICES.strategy)}`}</button></form>
        </div>
        {strategy && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              {strategy.positioning && <div><div className="label">Позиционирование</div><p className="text-sm">{strategy.positioning}</p></div>}
              {strategy.pains.length > 0 && <div><div className="label">Боли аудитории</div><ul className="list-disc space-y-0.5 pl-5 text-sm">{strategy.pains.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
            </div>
            <div>
              <div className="label">Рубрики и доли</div>
              <div className="space-y-2">{strategy.rubrics.map((r) => (
                <div key={r.name}><div className="flex justify-between text-sm"><b>{r.name}</b><span className="text-ink2">{r.share}%</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-tile2"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.share / maxShare) * 100}%` }} /></div>
                  {r.desc && <p className="mt-0.5 text-xs text-ink3">{r.desc}</p>}</div>
              ))}</div>
            </div>
          </div>
        )}
        {matrix && strategy && strategy.rubrics.length > 0 && (
          <div>
            <div className="label">Матрица плана: материалов по неделям</div>
            <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
              <thead><tr className="text-left text-xs text-ink3"><th className="pb-1.5 font-normal">Рубрика</th>{matrix.weeks.map((w) => <th key={w} className="pb-1.5 text-center font-normal">с {w}</th>)}<th className="pb-1.5 text-right font-normal">Всего</th></tr></thead>
              <tbody>
                {matrix.rows.map((r) => <tr key={r.name} className="border-t border-line"><td className="py-1.5">{r.name}</td>{r.counts.map((n, i) => <td key={i} className={`py-1.5 text-center ${n ? "" : "text-ink3"}`}>{n || "·"}</td>)}<td className="py-1.5 text-right font-medium">{r.total}</td></tr>)}
                {matrix.untagged.some((n) => n) && <tr className="border-t border-line text-ink2"><td className="py-1.5">Без рубрики</td>{matrix.untagged.map((n, i) => <td key={i} className="py-1.5 text-center">{n || "·"}</td>)}<td className="py-1.5 text-right">{matrix.untagged.reduce((a, b) => a + b, 0)}</td></tr>}
              </tbody></table></div>
          </div>
        )}
        <details className="rounded-xl bg-tile p-3">
          <summary className="cursor-pointer text-xs font-medium text-ink2">Править стратегию вручную</summary>
          <form action={saveStrategyAction} className="mt-3 space-y-2">
            <input type="hidden" name="factory" value={factoryId} />
            <textarea name="positioning" rows={2} defaultValue={strategy?.positioning ?? ""} maxLength={500} placeholder="Позиционирование в контенте" className="input !bg-surface text-sm" />
            <textarea name="pains" rows={3} defaultValue={strategy?.pains.join("\n") ?? ""} placeholder="Боли аудитории, по одной в строке" className="input !bg-surface text-sm" />
            {slots.map((r, i) => (
              <div key={i} className="grid gap-1.5 sm:grid-cols-[1fr_5rem_2fr]">
                <input name={`rname_${i}`} defaultValue={r.name} maxLength={40} placeholder={`Рубрика ${i + 1}`} className="input !bg-surface text-sm" />
                <input name={`rshare_${i}`} type="number" min={0} max={100} defaultValue={r.name ? r.share : ""} placeholder="%" className="input !bg-surface text-sm" />
                <input name={`rdesc_${i}`} defaultValue={r.desc} maxLength={200} placeholder="О чём рубрика" className="input !bg-surface text-sm" />
              </div>
            ))}
            <div className="flex items-center gap-3"><button className="btn">Сохранить</button><span className="text-xs text-ink3">Доли приводятся к 100%. Пустая рубрика удаляется.</span></div>
          </form>
        </details>
      </div>
    </details>
  );
}
