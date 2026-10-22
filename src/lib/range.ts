/** Период и фильтры для «Аналитики» и «Публикаций». Даты — календарные дни по Москве (в России нет перехода на летнее время, смещение всегда +03:00). */
export type Preset = "today" | "yesterday" | "tomorrow" | "7" | "30" | "all" | "custom";
export interface Range { r: Preset; from: string; to: string }

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const todayMsk = () => iso(Date.now() + 3 * 3_600_000);
const shift = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY);
const valid = (d?: string) => !!d && ISO.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

/** Пустые from/to — без ограничения с этой стороны. Старый параметр d (7|30|all) понимаем, чтобы прежние ссылки работали. */
export function parseRange(sp: { r?: string; d?: string; from?: string; to?: string }, allowed: Preset[], def: Preset): Range {
  const want = (sp.r ?? sp.d ?? "") as Preset;
  const r: Preset = allowed.includes(want) ? want : def;
  const t = todayMsk();
  switch (r) {
    case "today": return { r, from: t, to: t };
    case "yesterday": return { r, from: shift(t, -1), to: shift(t, -1) };
    case "tomorrow": return { r, from: shift(t, 1), to: shift(t, 1) };
    case "7": return { r, from: shift(t, -6), to: t };
    case "30": return { r, from: shift(t, -29), to: t };
    case "custom": {
      let from = valid(sp.from) ? sp.from! : "", to = valid(sp.to) ? sp.to! : "";
      if (from && to && from > to) [from, to] = [to, from];
      return { r, from, to };
    }
    default: return { r: "all", from: "", to: "" };
  }
}

/** Границы для SQL: [from, to) как моменты времени. */
export const bounds = (g: { from?: string; to?: string }) => ({
  from: g.from && valid(g.from) ? new Date(`${g.from}T00:00:00+03:00`).toISOString() : null,
  to: g.to && valid(g.to) ? new Date(Date.parse(`${g.to}T00:00:00+03:00`) + DAY).toISOString() : null,
});

export const uuidOrEmpty = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : "");

export const rangeLabel = (g: Range) => {
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (g.r === "all") return "за всё время";
  if (g.from && g.from === g.to) return f(g.from);
  return `${g.from ? f(g.from) : "…"} — ${g.to ? f(g.to) : "…"}`;
};
