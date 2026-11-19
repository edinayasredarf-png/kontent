import type { ChartOptions } from "chart.js";
type Theme = { line: string; ink: string; ink2: string; surface: string; accent: string };
export function analyticsLineOptions(theme: Theme | null, label: string, format: (n: number) => string): ChartOptions<"line"> {
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: "nearest", intersect: false },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: theme?.surface, titleColor: theme?.ink, bodyColor: theme?.ink, borderColor: theme?.line, borderWidth: 1, padding: 12, cornerRadius: 10, callbacks: { label: item => `${label}: ${format(Number(item.parsed.y))}` } } },
    scales: {
      x: { grid: { color: theme?.line, drawTicks: false }, border: { display: false, dash: [3,3] }, ticks: { color: theme?.ink2, maxTicksLimit: 8, autoSkipPadding: 12, maxRotation: 0, padding: 9, font: { size: 11 } } },
      y: { beginAtZero: true, suggestedMax: 1, grid: { color: theme?.line, drawTicks: false }, border: { display: false, dash: [3,3] }, ticks: { color: theme?.ink2, maxTicksLimit: 5, callback: value => format(Number(value)) } },
    },
  };
}
