"use client";
import { useEffect, useMemo, useState } from "react";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip, type ChartOptions, type Plugin } from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip);

export interface DayPoint { day: string; revenue: number; aiCost: number; expenses: number; profit: number }
export interface Slice { label: string; value: number }
type Kind = "profit" | "flow" | "cumulative" | "costs" | "actions";
const TABS: [Kind, string][] = [["profit", "Прибыль по дням"], ["flow", "Доходы и расходы"], ["cumulative", "Накопительно"], ["costs", "Куда уходят деньги"], ["actions", "Выручка по действиям"]];

/** Цвета берутся из темы сайта: график сам перекрашивается при переключении светлой и тёмной темы. */
function useTheme() {
  const read = () => {
    const cs = getComputedStyle(document.documentElement), v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    return { ink: v("--ink", "#172554"), ink2: v("--ink2", "#64748b"), line: v("--line", "#ede9fe"), surface: v("--surface", "#fff"), good: v("--good", "#1f9d57"), bad: v("--bad", "#e24a41"), accent: v("--accent", "#1734fc") };
  };
  const [t, setT] = useState<ReturnType<typeof read> | null>(null);
  useEffect(() => {
    setT(read());
    const up = () => setT(read());
    const mo = new MutationObserver(up); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", up);
    return () => { mo.disconnect(); mq.removeEventListener("change", up); };
  }, []);
  return t;
}

const PURPLE = ["#8b5cf6", "#5b2fd6"], ORANGE = ["#fbbf24", "#f97316"], BLUE = ["#60a5fa", "#4f46e5"];
const SLICES = ["#6d4aff", "#f59e0b", "#22b8cf", "#ef6aa7", "#84cc16", "#f97316", "#0ea5e9", "#a78bfa", "#14b8a6", "#e11d48"];
const rubFmt = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
const dayFmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });

/** Градиент сверху вниз по области графика (рисуется на canvas, поэтому задаётся функцией). */
const grad = (a: string, b: string) => (ctx: { chart: ChartJS }) => {
  const area = ctx.chart.chartArea;
  if (!area) return a;
  const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
};

export function EconomyCharts({ days, prev, prevLabel, costs, actions }: { days: DayPoint[]; prev?: DayPoint[]; prevLabel?: string; costs: Slice[]; actions: Slice[] }) {
  const [kind, setKind] = useState<Kind>("profit");
  const th = useTheme();
  const rub = (k: number) => Math.round(k) / 100;
  const labels = useMemo(() => days.map((d) => dayFmt(d.day)), [days]);

  const base = useMemo<ChartOptions<"bar" | "line">>(() => !th ? {} : ({
    responsive: true, maintainAspectRatio: false, animation: { duration: 650, easing: "easeOutQuart" }, interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "bottom", labels: { color: th.ink2, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 16, font: { size: 12 } } },
      tooltip: { backgroundColor: th.surface, titleColor: th.ink, bodyColor: th.ink, borderColor: th.line, borderWidth: 1, padding: 12, cornerRadius: 12, boxPadding: 5, usePointStyle: true,
        callbacks: { label: (c) => ` ${c.dataset.label}: ${rubFmt(Number(c.parsed.y))}` } },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: th.ink2, maxRotation: 0, autoSkip: true, maxTicksLimit: 10, font: { size: 11 } } },
      y: { grid: { color: th.line, tickBorderDash: [4, 4] }, border: { display: false, dash: [4, 4] }, ticks: { color: th.ink2, font: { size: 11 }, callback: (v) => `${Number(v).toLocaleString("ru-RU")} ₽` } },
    },
  } as ChartOptions<"bar" | "line">), [th]);

  if (!th) return <div className="h-80 animate-pulse rounded-2xl bg-tile" aria-hidden />;
  const prevLine = prev?.length ? prev.slice(0, days.length).map((p) => rub(p.profit)) : null;
  const total = (s: Slice[]) => s.reduce((a, x) => a + x.value, 0);
  const donut = (items: Slice[], title: string) => {
    const sum = total(items);
    const centre: Plugin<"doughnut"> = { id: "centre", afterDraw(chart) {
      const { ctx, chartArea: a } = chart; if (!a) return;
      ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = th.ink;
      const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
      ctx.font = "600 22px system-ui, sans-serif"; ctx.fillText(rubFmt(rub(sum)), cx, cy + 2);
      ctx.fillStyle = th.ink2; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(title, cx, cy + 22); ctx.restore();
    } };
    return (
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="relative mx-auto h-72 w-full max-w-[320px]">
          <Doughnut key={title} plugins={[centre]} data={{ labels: items.map((i) => i.label), datasets: [{ data: items.map((i) => rub(i.value)), backgroundColor: items.map((_, i) => SLICES[i % SLICES.length]), borderColor: th.surface, borderWidth: 3, borderRadius: 8, hoverOffset: 8, spacing: 2 }] }}
            options={{ responsive: true, maintainAspectRatio: false, cutout: "72%", animation: { animateRotate: true, duration: 800 }, plugins: { legend: { display: false }, tooltip: { backgroundColor: th.surface, titleColor: th.ink, bodyColor: th.ink, borderColor: th.line, borderWidth: 1, padding: 12, cornerRadius: 12, callbacks: { label: (c) => ` ${c.label}: ${rubFmt(Number(c.parsed))} (${sum ? Math.round((Number(c.parsed) * 100 * 100) / sum) : 0}%)` } } } }} />
        </div>
        <ul className="space-y-2 text-sm">
          {items.map((i, n) => (
            <li key={i.label} className="flex items-center gap-3"><i className="size-3 shrink-0 rounded-full" style={{ background: SLICES[n % SLICES.length] }} /><span className="min-w-0 flex-1 truncate">{i.label}</span>
              <span className="shrink-0 font-semibold">{rubFmt(rub(i.value))}</span><span className="w-10 shrink-0 text-right text-xs text-ink2">{sum ? Math.round((i.value / sum) * 100) : 0}%</span></li>))}
        </ul>
      </div>
    );
  };

  let body: React.ReactNode;
  const empty = (txt: string) => <div className="grid h-64 place-items-center rounded-2xl bg-tile text-sm text-ink2">{txt}</div>;
  if (kind === "profit") {
    const p = days.map((d) => rub(d.profit));
    body = days.length === 0 ? empty("За этот период нет данных") : (
      <div className="h-80"><Bar key={kind} data={{ labels, datasets: [
        { type: "bar" as const, label: "Прибыль", data: p, borderRadius: 8, borderSkipped: false, maxBarThickness: 34,
          backgroundColor: (c: { chart: ChartJS; dataIndex: number }) => (p[c.dataIndex] >= 0 ? grad("#34d399", "#059669")(c) : grad("#fb7185", "#e11d48")(c)) },
        ...(prevLine ? [{ type: "line" as const, label: prevLabel ?? "Прошлый период", data: prevLine, borderColor: th.ink2, borderWidth: 2, borderDash: [6, 5], tension: 0.4, pointRadius: 0, pointHoverRadius: 5, backgroundColor: "transparent" }] : []),
      ] as never }} options={base as ChartOptions<"bar">} /></div>);
  } else if (kind === "flow") {
    body = days.length === 0 ? empty("За этот период нет данных") : (
      <div className="h-80"><Bar key={kind} data={{ labels, datasets: [
        { type: "bar" as const, label: "Выручка", data: days.map((d) => rub(d.revenue)), borderRadius: 8, borderSkipped: false, maxBarThickness: 22, backgroundColor: grad(BLUE[0], BLUE[1]), stack: "a", order: 2 },
        { type: "bar" as const, label: "Нейросети", data: days.map((d) => rub(d.aiCost)), borderRadius: 8, borderSkipped: false, maxBarThickness: 22, backgroundColor: grad(ORANGE[0], ORANGE[1]), stack: "b", order: 2 },
        { type: "bar" as const, label: "Прочие расходы", data: days.map((d) => rub(d.expenses)), borderRadius: 8, borderSkipped: false, maxBarThickness: 22, backgroundColor: grad(PURPLE[0], PURPLE[1]), stack: "b", order: 2 },
        { type: "line" as const, label: "Прибыль", data: days.map((d) => rub(d.profit)), borderColor: th.good, borderWidth: 3, tension: 0.4, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: th.surface, pointBorderColor: th.good, pointBorderWidth: 2.5, order: 1 },
      ] as never }} options={base as ChartOptions<"bar">} /></div>);
  } else if (kind === "cumulative") {
    let s = 0, sp = 0;
    const cum = days.map((d) => (s += rub(d.profit)));
    const cumPrev = prev?.length ? prev.slice(0, days.length).map((d) => (sp += rub(d.profit))) : null;
    const last = cum.length - 1, mx = cum.indexOf(Math.max(...cum)), mn = cum.indexOf(Math.min(...cum));
    const marked = new Set([last, mx, mn]);
    body = days.length === 0 ? empty("За этот период нет данных") : (
      <div className="h-80"><Line key={kind} data={{ labels, datasets: [
        { label: "Накопленная прибыль", data: cum, borderColor: PURPLE[1], borderWidth: 3, tension: 0.42, fill: true, backgroundColor: grad("rgba(139,92,246,.38)", "rgba(139,92,246,0)"),
          pointRadius: cum.map((_, i) => (marked.has(i) ? 6 : 0)), pointHoverRadius: 7, pointBackgroundColor: th.surface, pointBorderColor: PURPLE[1], pointBorderWidth: 3 },
        ...(cumPrev ? [{ label: prevLabel ?? "Прошлый период", data: cumPrev, borderColor: th.ink2, borderWidth: 2, borderDash: [6, 5], tension: 0.42, pointRadius: 0, pointHoverRadius: 5, fill: false }] : []),
      ] }} options={base as ChartOptions<"line">} /></div>);
  } else if (kind === "costs") {
    body = costs.length === 0 || total(costs) === 0 ? empty("Затрат за этот период нет") : donut(costs, "всего затрат");
  } else {
    body = actions.length === 0 || total(actions) === 0 ? empty("Выручки за этот период нет") : donut(actions, "выручка");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Вид графика">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${kind === k ? "bg-accent text-white shadow-sm" : "bg-tile text-ink2 hover:text-ink"}`}>{l}</button>))}
      </div>
      {body}
    </div>
  );
}
