"use client";
import { useMemo } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { grad, SLICES, useTheme } from "./EconomyCharts";

const num = (n: number) => n.toLocaleString("ru-RU");

/** Лучшее время публикации: столбцы по часам, самый сильный час подсвечен. */
export function HourChart({ hours }: { hours: { hour: number; posts: number; avg: number }[] }) {
  const th = useTheme();
  const options = useMemo<ChartOptions<"bar">>(() => !th ? {} : ({
    responsive: true, maintainAspectRatio: false, animation: { duration: 650, easing: "easeOutQuart" },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: th.surface, titleColor: th.ink, bodyColor: th.ink, borderColor: th.line, borderWidth: 1, padding: 12, cornerRadius: 12,
      callbacks: { title: (i) => `${i[0].label}:00`, label: (c) => ` ${num(Number(c.parsed.y))} просм. в среднем · постов: ${hours[c.dataIndex]?.posts ?? 0}` } } },
    scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: th.ink2, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: th.line }, border: { display: false, dash: [4, 4] }, ticks: { color: th.ink2, font: { size: 11 }, maxTicksLimit: 5 } } },
  } as ChartOptions<"bar">), [th, hours]);
  if (!th) return <div className="h-56 animate-pulse rounded-2xl bg-tile" aria-hidden />;
  const best = hours.reduce((b, h, i) => (h.avg > (hours[b]?.avg ?? -1) ? i : b), 0);
  return (
    <div className="h-56"><Bar options={options} data={{ labels: hours.map((h) => String(h.hour)), datasets: [{
      label: "Просмотры", data: hours.map((h) => h.avg), borderRadius: 8, borderSkipped: false, maxBarThickness: 28,
      backgroundColor: (c: { chart: never; dataIndex: number }) => (c.dataIndex === best ? grad("#fbbf24", "#f97316")(c) : grad("#8b5cf6", "#5b2fd6")(c)) }] as never }} /></div>
  );
}

/** Динамика подписчиков канала: сглаженная линия с градиентной заливкой. */
export function MembersChart({ series }: { series: { day: string; members: number }[] }) {
  const th = useTheme();
  const options = useMemo<ChartOptions<"line">>(() => !th ? {} : ({
    responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: th.surface, titleColor: th.ink, bodyColor: th.ink, borderColor: th.line, borderWidth: 1, padding: 10, cornerRadius: 10,
      callbacks: { label: (c) => ` ${num(Number(c.parsed.y))} подписчиков` } } },
    scales: { x: { display: false }, y: { display: false } },
  } as ChartOptions<"line">), [th]);
  if (!th) return <div className="h-20 animate-pulse rounded-xl bg-tile" aria-hidden />;
  return (
    <div className="h-20"><Line options={options} data={{ labels: series.map((p) => p.day),
      datasets: [{ data: series.map((p) => p.members), borderColor: "#8b5cf6", borderWidth: 3, tension: 0.4, pointRadius: series.length > 14 ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: th.surface, pointBorderColor: "#8b5cf6", pointBorderWidth: 2, fill: true,
        backgroundColor: (c: { chart: never }) => grad("rgba(139,92,246,.35)", "rgba(139,92,246,0)")(c) }] as never }} /></div>
  );
}

/** Доля просмотров по каналам или форматам: бублик с суммой в центре. */
export function ShareDonut({ items, title }: { items: { label: string; value: number }[]; title: string }) {
  const th = useTheme();
  const sum = items.reduce((a, x) => a + x.value, 0);
  const plugins = useMemo(() => [{ id: "centre", afterDraw(chart: { ctx: CanvasRenderingContext2D; chartArea: { left: number; right: number; top: number; bottom: number } }) {
    const { ctx, chartArea: a } = chart; if (!a || !th) return;
    const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
    ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = th.ink; ctx.font = "600 22px system-ui, sans-serif"; ctx.fillText(num(sum), cx, cy + 2);
    ctx.fillStyle = th.ink2; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(title, cx, cy + 22); ctx.restore();
  } }], [th, sum, title]);
  if (!th) return <div className="h-56 animate-pulse rounded-2xl bg-tile" aria-hidden />;
  if (sum === 0) return <div className="grid h-40 place-items-center rounded-2xl bg-tile text-sm text-ink2">Просмотров пока нет</div>;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
      <div className="relative mx-auto h-48 w-48"><Doughnut plugins={plugins as never} data={{ labels: items.map((i) => i.label), datasets: [{ data: items.map((i) => i.value), backgroundColor: items.map((_, i) => SLICES[i % SLICES.length]), borderColor: th.surface, borderWidth: 3, borderRadius: 8, hoverOffset: 8, spacing: 2 }] }}
        options={{ responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { legend: { display: false }, tooltip: { backgroundColor: th.surface, titleColor: th.ink, bodyColor: th.ink, borderColor: th.line, borderWidth: 1, padding: 10, cornerRadius: 10, callbacks: { label: (c) => ` ${num(Number(c.parsed))} просм.` } } } }} /></div>
      <ul className="space-y-1.5 text-sm">{items.map((i, n) => (
        <li key={i.label} className="flex items-center gap-2"><i className="size-2.5 shrink-0 rounded-full" style={{ background: SLICES[n % SLICES.length] }} /><span className="min-w-0 flex-1 truncate">{i.label}</span>
          <span className="shrink-0 font-semibold">{num(i.value)}</span><span className="w-9 shrink-0 text-right text-xs text-ink2">{Math.round((i.value / sum) * 100)}%</span></li>))}</ul>
    </div>
  );
}
