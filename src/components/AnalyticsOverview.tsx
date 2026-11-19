"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Line } from "react-chartjs-2";
import { analyticsLineOptions } from "./analytics-line";
import type { AnalyticsDay } from "@/lib/engage";
import type { Range } from "@/lib/range";
import type { FilterSelect } from "./FilterBar";
import { useTheme } from "./EconomyCharts";

const METRICS = [
  ["views", "Просмотры"], ["likes", "Лайки"], ["comments", "Комментарии"],
  ["reposts", "Репосты"], ["rate", "Вовлечённость"],
] as const;
type Metric = typeof METRICS[number][0];
type Detail = "day" | "week" | "month";
const DAY = 86_400_000;
const time = (day: string) => Date.parse(`${day}T00:00:00Z`);
const isoDay = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);
const format = (n: number, metric: Metric) => n.toLocaleString("ru-RU", { maximumFractionDigits: metric === "rate" ? 1 : 0 }) + (metric === "rate" ? "%" : "");
const valueOf = (p: Omit<AnalyticsDay, "day">, metric: Metric) => metric === "rate"
  ? p.views ? (p.likes + p.comments + p.reposts) / p.views * 100 : 0
  : p[metric];

function groupDays(days: AnalyticsDay[], from: string, to: string, detail: Detail) {
  const first = from || days[0]?.day || to;
  const last = to || days.at(-1)?.day || from;
  if (!first || !last || first > last) return [];
  const key = (day: string) => {
    if (detail === "month") return `${day.slice(0, 7)}-01`;
    const stamp = time(day);
    return detail === "week" ? isoDay(stamp - ((new Date(stamp).getUTCDay() + 6) % 7) * DAY) : day;
  };
  const buckets = new Map<string, AnalyticsDay>();
  const get = (day: string) => {
    const existing = buckets.get(day);
    if (existing) return existing;
    const empty = { day, views: 0, likes: 0, comments: 0, reposts: 0 };
    buckets.set(day, empty);
    return empty;
  };
  const start = time(key(first)), end = time(key(last));
  const step = detail === "week" ? DAY * 7 : DAY;
  for (let stamp = start; stamp <= end;) {
    get(isoDay(stamp));
    const date = new Date(stamp);
    stamp = detail === "month" ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) : stamp + step;
  }
  for (const day of days) {
    const p = get(key(day.day));
    p.views += day.views;
    p.likes += day.likes;
    p.comments += day.comments;
    p.reposts += day.reposts;
  }
  return [...buckets.values()];
}

export function AnalyticsOverview({ range, presets, totals, days, filters }: {
  range: Range; presets: [string, string][]; totals: Omit<AnalyticsDay, "day">; days: AnalyticsDay[]; filters: FilterSelect[];
}) {
  const router = useRouter();
  const theme = useTheme();
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [metric, setMetric] = useState<Metric>("views");
  const [detail, setDetail] = useState<Detail>("day");
  const [dates, setDates] = useState({ from: range.from, to: range.to });
  useEffect(() => setDates({ from: range.from, to: range.to }), [range.from, range.to]);
  const since = range.from || days[0]?.day;
  const until = range.to || days.at(-1)?.day;
  const span = since && until ? (time(until) - time(since)) / DAY : 0;
  const dailyAllowed = span <= 366;
  const weeklyAllowed = span <= 366 * 5;
  const group = detail === "month" || !weeklyAllowed ? "month" : detail === "week" || !dailyAllowed ? "week" : "day";
  const series = useMemo(() => groupDays(days, range.from, range.to, group), [days, range.from, range.to, group]);
  const label = METRICS.find(([key]) => key === metric)![1];
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    ...(group === "month" ? { month: "short", year: "numeric" } : { day: "2-digit", month: "short", ...(group === "day" ? { weekday: "short" } : {}) }),
    timeZone: "UTC",
  });
  const labels = series.map(({ day }) => dateLabel.format(new Date(time(day))));
  function apply(patch: Record<string, string>) {
    const params = new URLSearchParams({ r: range.r, ...Object.fromEntries(filters.map(f => [f.name, f.value])) });
    if (range.r === "custom") { params.set("from", range.from); params.set("to", range.to); }
    for (const [key, value] of Object.entries(patch)) params.set(key, value);
    if (params.get("r") !== "custom") { params.delete("from"); params.delete("to"); }
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    start(() => router.replace(`/app/analytics?${params}`, { scroll: false }));
  }
  const options = analyticsLineOptions(theme, label, n => format(n, metric));
  const control = "input !rounded-lg !border-line !bg-surface !py-1.5 !text-xs font-semibold";
  return (
    <section aria-label="Сводная аналитика" aria-busy={pending} className="mb-6 overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 sm:px-6">
        <div role="group" aria-label="Показатель графика" className="flex min-w-0 flex-1 gap-5 overflow-x-auto sm:justify-between">
          {METRICS.map(([key, name]) => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}
            className={`shrink-0 border-b-2 pb-3 pt-3.5 text-left ${metric === key ? "border-accent text-accent-ink" : "border-transparent text-ink2 hover:text-ink"}`}>
            <span className="block text-xs font-semibold sm:text-sm">{name}</span>
            <span className="mt-0.5 block text-lg font-semibold leading-6 text-ink tabular-nums">{format(valueOf(totals, key), key)}</span>
          </button>)}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 pb-3 pt-1 xl:w-auto xl:pb-0">
          {filters.map(f => <select key={f.name} aria-label={f.label} value={f.value} onChange={e => apply({ [f.name]: e.target.value })} className={`${control} !w-auto max-w-[190px]`}>
            <option value="">{f.all}</option>{f.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>)}
          <button type="button" aria-expanded={!hidden} aria-controls="analytics-trend" onClick={() => setHidden(!hidden)} className="inline-flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-ink">
            {hidden ? "Показать" : "Скрыть"}{hidden ? <ArrowDown size={15} /> : <ArrowUp size={15} />}
          </button>
        </div>
      </div>
      {!hidden && <div id="analytics-trend" className="grid min-w-0 gap-5 border-t border-line p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(240px,25%)] xl:gap-10">
        <div className="order-2 min-w-0 px-1 pb-2 xl:order-1 xl:px-5 xl:pt-6">
          <div className="relative h-56 sm:h-64">
            {theme && series.length > 0 ? <Line role="img" aria-label={`${label} по датам публикации`} title="Показатели сгруппированы по дате публикации" options={options} data={{ labels, datasets: [
              { label, data: series.map(point => valueOf(point, metric)), borderColor: theme.accent, borderWidth: 2, pointRadius: series.length <= 35 ? 3 : 0, pointHoverRadius: 5, pointBackgroundColor: theme.surface, pointBorderColor: theme.accent, pointBorderWidth: 2 },
            ] }} /> : <div className="grid h-full place-items-center rounded-xl border border-dashed border-line text-sm text-ink2">{theme ? "За выбранный период данных нет" : ""}</div>}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="relative w-11 border-t-2 border-accent before:absolute before:-top-[5px] before:left-0 before:size-2 before:rounded-full before:border-2 before:border-accent before:bg-surface after:absolute after:-top-[5px] after:right-0 after:size-2 after:rounded-full after:border-2 after:border-accent after:bg-surface" />{label}</div>
        </div>
        <div className="order-1 space-y-3 xl:order-2">
          <select aria-label="Период" className={control} value={range.r} onChange={e => apply({ r: e.target.value, from: dates.from, to: dates.to })}>
            {presets.map(([key, name]) => <option key={key} value={key}>{name}</option>)}<option value="custom">Свой период</option>
          </select>
          <form onSubmit={e => { e.preventDefault(); apply({ r: "custom", ...dates }); }} className="flex flex-wrap items-center gap-2">
            <input aria-label="Начало периода" type="date" value={dates.from} onChange={e => setDates({ ...dates, from: e.target.value })} className={`${control} min-w-[116px] flex-1`} />
            <span aria-hidden className="text-ink2">—</span>
            <input aria-label="Конец периода" type="date" value={dates.to} onChange={e => setDates({ ...dates, to: e.target.value })} className={`${control} min-w-[116px] flex-1`} />
            {(dates.from !== range.from || dates.to !== range.to) && <button type="submit" className="btn btn-ghost !py-1 text-xs">Применить даты</button>}
          </form>
          <select aria-label="Детализация графика" className={control} value={group} onChange={e => setDetail(e.target.value as Detail)}>
            <option value="day" disabled={!dailyAllowed}>Детализация: по дням</option><option value="week" disabled={!weeklyAllowed}>Детализация: по неделям</option><option value="month">Детализация: по месяцам</option>
          </select>
        </div>
      </div>}
    </section>
  );
}
