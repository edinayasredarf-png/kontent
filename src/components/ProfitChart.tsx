import { rub } from "@/lib/wallet";

export interface ChartDay { day: string; profit: number }

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const rubShort = (kop: number) => `${Math.round(kop / 100).toLocaleString("ru-RU")} ₽`;

/**
 * Прибыль по дням: столбики (зелёные — прибыль, красные — убыток) и пунктирная линия прибыли за предыдущий период, наложенная по порядковому дню.
 * Рисуется на сервере обычным SVG, без библиотек; у каждого столбика есть подсказка с днём и суммой.
 */
export function ProfitChart({ rows, prev, prevLabel }: { rows: ChartDay[]; prev?: ChartDay[]; prevLabel?: string }) {
  if (rows.length === 0) return null;
  const W = 800, H = 240, L = 54, R = 10, T = 14, B = 28;
  const vals = [...rows.map((r) => r.profit), ...(prev ?? []).map((r) => r.profit), 0];
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = max - min || 1;
  const y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const slot = (W - L - R) / rows.length, bw = Math.max(2, Math.min(28, slot * 0.7));
  const x = (i: number) => L + slot * i + slot / 2;
  const ticks = [max, (max + min) / 2, min].filter((v, i, a) => a.indexOf(v) === i);
  const labelIdx = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  const line = prev && prev.length ? prev.slice(0, rows.length).map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.profit).toFixed(1)}`).join(" ") : "";
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Прибыль по дням" className="h-auto w-full">
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.4 : 0.1} /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity={0.6}>{rubShort(t)}</text></g>)}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.4} />
        {rows.map((r, i) => {
          const top = Math.min(y(r.profit), y(0)), h = Math.max(1.5, Math.abs(y(r.profit) - y(0)));
          return <rect key={r.day} x={x(i) - bw / 2} y={top} width={bw} height={h} rx={Math.min(3, bw / 3)} fill={r.profit >= 0 ? "var(--good, #16a34a)" : "var(--bad, #dc2626)"}><title>{`${fmtDay(r.day)}: ${rub(Math.round(r.profit))}`}</title></rect>;
        })}
        {line && <path d={line} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray="5 4" />}
        {labelIdx.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"} fontSize="11" fill="currentColor" fillOpacity={0.6}>{fmtDay(rows[i].day)}</text>)}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-ink2">
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-good" />прибыль</span>
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-bad" />убыток</span>
        {line && <span className="flex items-center gap-1.5"><i className="inline-block w-5 border-t-2 border-dashed border-current opacity-60" />{prevLabel ?? "прошлый период"}</span>}
      </div>
    </div>
  );
}
