/** Calendar arithmetic uses date-only UTC values, independent of server/browser timezone. */
export const PERIODS = { day: "День", week: "Неделя", month: "Месяц", year: "Год" } as const;
export type CalendarPeriod = keyof typeof PERIODS;
export const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const CALENDAR_COLORS = [
  { id: "blue", label: "Синий", value: "#087cf0" }, { id: "green", label: "Зелёный", value: "#199b52" },
  { id: "orange", label: "Оранжевый", value: "#e56722" }, { id: "yellow", label: "Жёлтый", value: "#b88a08" },
  { id: "purple", label: "Фиолетовый", value: "#8750da" }, { id: "pink", label: "Розовый", value: "#dc3981" },
  { id: "teal", label: "Бирюзовый", value: "#139f9d" },
] as const;
export const calendarColor = (id?: string | null) => CALENDAR_COLORS.find((c) => c.id === id);
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export function validDay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 4)) >= 1900 && Number(s.slice(0, 4)) <= 2100 && !Number.isNaN(Date.parse(s)) && isoDay(new Date(s)) === s;
}
export const moscowToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date());
export const addDays = (day: string, n: number) => { const d = new Date(day); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
export function monthCells(month: string): string[] {
  const first = `${month}-01`, d = new Date(first);
  const start = addDays(first, -((d.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return days.slice(35).every((x) => x.slice(0, 7) !== month) ? days.slice(0, 35) : days;
}
export function calendarRange(period: CalendarPeriod, day: string) {
  let days: string[];
  if (period === "day") days = [day];
  else if (period === "week") { const start = addDays(day, -((new Date(day).getUTCDay() + 6) % 7)); days = Array.from({ length: 7 }, (_, i) => addDays(start, i)); }
  else if (period === "year") { const y = day.slice(0, 4); const first = monthCells(`${y}-01`), last = monthCells(`${y}-12`); return { from: first[0], to: last[last.length - 1], days: [] as string[] }; }
  else days = monthCells(day.slice(0, 7));
  return { from: days[0], to: days[days.length - 1], days };
}
export function shiftPeriod(period: CalendarPeriod, day: string, n: number): string {
  if (period === "day" || period === "week") return addDays(day, n * (period === "week" ? 7 : 1));
  const d = new Date(day), date = d.getUTCDate(); d.setUTCDate(1);
  if (period === "year") d.setUTCFullYear(d.getUTCFullYear() + n); else d.setUTCMonth(d.getUTCMonth() + n);
  const end = new Date(d); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  d.setUTCDate(Math.min(date, end.getUTCDate())); return isoDay(d);
}
export function calendarHref(base: string, patch: Record<string, string>): string {
  const [path, search] = base.split("?"); const q = new URLSearchParams(search);
  for (const k of ["item", "err", "note"]) q.delete(k);
  for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
  return `${path}?${q}`;
}
export function periodTitle(period: CalendarPeriod, day: string): string {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  if (period === "year") return String(y);
  if (period === "month") return `${MONTHS[m - 1]} ${y}`;
  const fmt = (x: string) => new Date(x).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  if (period === "day") return fmt(day);
  const r = calendarRange(period, day); return `${fmt(r.from)} — ${fmt(r.to)}`;
}
