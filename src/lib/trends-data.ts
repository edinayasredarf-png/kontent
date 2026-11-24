import type { Item } from "./monitor/parse";
export interface TrendSource { id: number; title: string; summary: string; url: string; date: string }
export interface TrendIdea { id: string; title: string; hook: string; fit: string; angle: string; kind: "post" | "carousel"; sources: number[] }
export interface TrendReport { ideas: TrendIdea[]; sources: TrendSource[]; summary: string }
export interface TrendRun { id: string; factory_id: string; query: string; days: number; result: TrendReport; created_at: string }
export interface TrendFactory { id: string; name: string; brand: string; niche: string; product: string }

export function freshTrendSources(items: Item[], days: number, now = Date.now()): TrendSource[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const date = item.publishedAt.getTime();
    if (!Number.isFinite(date) || date < now - days * 86400000 || date > now + 3600000) return false;
    let url: URL;
    try { url = new URL(item.url); } catch { return false; }
    if (!["https:", "http:"].includes(url.protocol) || !item.title.trim()) return false;
    const key = item.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a,b) => b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0,24)
    .map((item, n) => ({ id: n + 1, title: item.title.slice(0,300), summary: item.body.slice(0,550), url: item.url, date: item.publishedAt.toISOString() }));
}
const str = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0,max) : "";
export function cleanTrendReport(raw: Record<string, unknown> | null, sources: TrendSource[]): TrendReport {
  const allowed = new Set(sources.map(s => s.id));
  const seen = new Set<string>();
  const ideas: TrendIdea[] = [];
  for (const value of Array.isArray(raw?.ideas) ? raw.ideas : []) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const title = str(row.title,300), hook = str(row.hook,500), fit = str(row.fit,500), angle = str(row.angle,700);
    const ids = [...new Set((Array.isArray(row.sources) ? row.sources : []).filter((n): n is number => typeof n === "number" && Number.isInteger(n) && allowed.has(n)))];
    if (!title || !hook || !fit || !angle || !ids.length || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    ideas.push({ id: String(ideas.length + 1), title, hook, fit, angle, kind: row.kind === "carousel" ? "carousel" : "post", sources: ids });
    if (ideas.length === 6) break;
  }
  if (!ideas.length) throw new Error("Не найдены идеи с подтверждёнными источниками. Попробуйте уточнить нишу.");
  return { ideas, sources, summary: str(raw?.summary,800) };
}
