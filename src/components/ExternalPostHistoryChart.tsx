"use client";
import { Line } from "react-chartjs-2";
import { useTheme } from "./EconomyCharts";
import { analyticsLineOptions } from "./analytics-line";
export function ExternalPostHistoryChart({ series }: { series: { at: string; views: number }[] }) {
  const theme = useTheme();
  const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  return <div className="relative h-56 sm:h-64" aria-label="График роста просмотров">
    {theme && series.length > 0 ? <Line options={analyticsLineOptions(theme,"Просмотры",fmt)} data={{
      labels: series.map(p => new Date(p.at).toLocaleString("ru-RU",{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })),
      datasets: [{ label: "Просмотры", data: series.map(p => p.views), borderColor: theme.accent, borderWidth: 2, pointRadius: series.length <= 35 ? 3 : 0, pointHoverRadius: 5, pointBackgroundColor: theme.surface, pointBorderColor: theme.accent, pointBorderWidth: 2 }],
    }} /> : <div className="grid h-full place-items-center text-sm text-ink2">{theme ? "Снимков показателей пока нет" : ""}</div>}
  </div>;
}
