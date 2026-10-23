import type { econByAction } from "@/lib/admin-econ";
import { rub } from "@/lib/wallet";

const pct = (m: number, rev: number) => (rev > 0 ? `${Math.round((m / rev) * 100)}%` : "—");

export function ActionTable({ rows, title }: { rows: Awaited<ReturnType<typeof econByAction>>; title: string }) {
  return (
    <section className="card mb-6 overflow-x-auto">
      <div className="border-b border-line px-5 py-3 text-sm font-medium">{title}</div>
      <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="text-left text-xs text-ink3"><th className="px-5 py-2 font-normal">Действие</th><th className="px-2 py-2 text-right font-normal">Операций</th><th className="px-2 py-2 text-right font-normal">Списано</th><th className="px-2 py-2 text-right font-normal">Вызовов ИИ</th><th className="px-2 py-2 text-right font-normal">Затраты</th><th className="px-2 py-2 text-right font-normal">Маржа</th><th className="px-5 py-2 text-right font-normal">Средняя цена / затраты</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-6 text-center text-ink2">Пока нет данных.</td></tr>}
          {rows.map((r) => { const rev = r.charged - r.refunded, m = rev - r.cost; return (
            <tr key={r.action} className="border-t border-line"><td className="px-5 py-2">{r.label}</td><td className="px-2 py-2 text-right">{r.ops.toLocaleString("ru-RU")}</td><td className="px-2 py-2 text-right">{rub(rev)}</td><td className="px-2 py-2 text-right">{r.calls.toLocaleString("ru-RU")}</td><td className="px-2 py-2 text-right">{rub(Math.round(r.cost))}</td>
              <td className={`px-2 py-2 text-right font-medium ${m < 0 ? "text-bad" : ""}`}>{rub(Math.round(m))}<div className="text-xs font-normal text-ink3">{pct(m, rev)}</div></td>
              <td className="px-5 py-2 text-right text-xs">{r.ops ? `${rub(Math.round(rev / r.ops))} / ${rub(Math.round(r.cost / r.ops))}` : "—"}</td></tr>); })}
        </tbody>
      </table>
    </section>
  );
}
