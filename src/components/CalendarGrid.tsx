"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { KIND, STATUS } from "./ui";
import { moveItemDateAction } from "@/lib/plan-actions";
import { calendarColor, calendarHref, calendarRange, MONTHS, monthCells, PERIODS, periodTitle, WEEKDAYS, type CalendarPeriod } from "@/lib/calendar";

export interface CalItem { id: string; date: string; time?: string | null; color?: string | null; kind: string; topic: string; status: string; label?: string; href: string; movable: boolean }
const DOT: Record<string, string> = { idea: "bg-ink3", approved: "bg-accent", generating: "bg-warn", ready: "bg-good", scheduled: "bg-accent", published: "bg-good", failed: "bg-bad", rejected: "bg-tile2" };

export function CalendarGrid({ month, date = `${month}-01`, period = "month", items: initial, prevHref, nextHref, view = "calendar", baseHref, today: initialToday }: {
  view?: string; month: string; date?: string; period?: CalendarPeriod; items: CalItem[]; prevHref: string; nextHref: string; baseHref?: string; today?: string;
}) {
  const [items, setItems] = useState(initial), [over, setOver] = useState<string | null>(null), [expanded, setExpanded] = useState<string[]>([]), [err, setErr] = useState("");
  const [today, setToday] = useState(initialToday ?? "");
  const [pending, run] = useTransition();
  const timeline = useRef<HTMLDivElement>(null);
  useEffect(() => { setItems(initial); }, [initial]);
  useEffect(() => { if (!initialToday) setToday(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date())); }, [initialToday]);
  useEffect(() => { if (timeline.current) timeline.current.scrollTop = 7 * 64; }, [period, date, view]);
  const move = (id: string, day: string) => {
    const it = items.find((x) => x.id === id); if (!it?.movable || it.date === day || pending) return;
    const prev = it.date; setErr(""); setItems((a) => a.map((x) => x.id === id ? { ...x, date: day } : x));
    run(async () => {
      try { const r = await moveItemDateAction(id, day); if (!r.ok) { setItems((a) => a.map((x) => x.id === id ? { ...x, date: prev } : x)); setErr(r.error); } }
      catch { setItems((a) => a.map((x) => x.id === id ? { ...x, date: prev } : x)); setErr("Не удалось перенести материал. Попробуйте ещё раз."); }
    });
  };
  const drop = (day: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(day); },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData("text/plain"), day); },
  });
  const by = new Map<string, CalItem[]>();
  for (const it of items) by.set(it.date, [...(by.get(it.date) ?? []), it]);
  for (const list of by.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const range = calendarRange(period, date);
  const inPeriod = items.filter((it) => period === "year" ? it.date.startsWith(date.slice(0, 4)) : period === "month" ? it.date.startsWith(month) : it.date >= range.from && it.date <= range.to);
  const href = (p: CalendarPeriod, day: string) => calendarHref(baseHref ?? "/app/calendar", { period: p, date: day, m: day.slice(0, 7) });
  const shortDay = (day: string) => new Date(day).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  const event = (it: CalItem, compact = false) => {
    const color = calendarColor(it.color);
    const style: CSSProperties = color ? { borderColor: color.value, backgroundColor: `color-mix(in srgb, ${color.value} 10%, var(--surface))` } : {};
    return <Link key={it.id} href={it.href} scroll={false} draggable={it.movable && !pending}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", it.id); e.dataTransfer.effectAllowed = "move"; }}
      aria-label={`${it.time ? `${it.time}, ` : ""}${it.topic}, ${STATUS[it.status]?.label ?? it.status}${color ? `, цвет: ${color.label}` : ""}`}
      title={`${it.label ? `${it.label}: ` : ""}${it.topic}${color ? ` · ${color.label}` : ""}`}
      style={style} className={`group block min-w-0 rounded-lg border-l-[3px] border-accent bg-tile px-2 py-1.5 text-left transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${it.movable ? "cursor-grab active:cursor-grabbing" : ""}`}>
      <span className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink2"><span className={`size-1.5 shrink-0 rounded-full ${DOT[it.status] ?? "bg-ink3"}`} />{it.time && <time className="font-semibold tabular-nums">{it.time}</time>}<span>{KIND[it.kind] ?? it.kind}</span></span>
      <span className={`block text-xs leading-4 text-ink ${compact ? "truncate" : "line-clamp-3 break-words"}`}>{it.topic}</span>
      {!compact && it.label && <span className="mt-1 block truncate text-[10px] text-ink3">{it.label}</span>}
    </Link>;
  };
  const monthGrid = (selectedMonth: string) => <div className="overflow-x-auto"><div className="min-w-[640px]">
    <div className="grid grid-cols-7 gap-1 pb-1.5 text-center text-xs text-ink3">{WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">{monthCells(selectedMonth).map((day) => {
      const list = by.get(day) ?? [], out = !day.startsWith(selectedMonth);
      return <div key={day} {...drop(day)} className={`min-h-28 rounded-xl p-1.5 transition-colors sm:min-h-32 ${over === day ? "bg-accent-soft ring-1 ring-inset ring-accent" : out ? "bg-surface/40" : "bg-surface"}`}>
        {baseHref ? <Link href={href("day", day)} scroll={false} aria-label={`Открыть день ${shortDay(day)}`} className={`mb-1 inline-grid size-6 place-items-center rounded-full text-xs hover:ring-1 hover:ring-accent ${day === today ? "bg-accent font-semibold text-white" : out ? "text-ink3" : "text-ink2"}`}>{Number(day.slice(-2))}</Link> : <div className={`mb-1 text-xs ${day === today ? "font-bold text-accent" : "text-ink2"}`}>{Number(day.slice(-2))}</div>}
        <div className="space-y-1">{(expanded.includes(day) ? list : list.slice(0, 3)).map((it) => event(it, true))}
          {list.length > 3 && <button type="button" aria-expanded={expanded.includes(day)} onClick={() => setExpanded((a) => a.includes(day) ? a.filter((x) => x !== day) : [...a, day])} className="px-1 py-1 text-[11px] text-accent-ink hover:underline">{expanded.includes(day) ? "Свернуть" : `Ещё ${list.length - 3}`}</button>}
        </div></div>;
    })}</div></div></div>;
  return <section aria-label="Календарь контент-плана" aria-busy={pending} className="overflow-hidden rounded-[28px] bg-[color-mix(in_srgb,var(--tile)_95%,#b5b2f4)] p-2.5">
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent px-3 py-2.5 text-white">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={prevHref} scroll={false} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink transition hover:bg-tile2" aria-label={`Предыдущий период: ${PERIODS[period]}`}><ChevronLeft size={18} /></Link>
        <h2 className="max-w-[23rem] text-sm font-semibold tabular-nums sm:text-base" aria-live="polite">{periodTitle(period, date)}</h2>
        <Link href={nextHref} scroll={false} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink transition hover:bg-tile2" aria-label={`Следующий период: ${PERIODS[period]}`}><ChevronRight size={18} /></Link>
      </div>
      {baseHref && <nav aria-label="Период календаря" className="flex flex-wrap items-center gap-1 text-sm">
        {today && <Link href={href(period, today)} scroll={false} className="mr-2 rounded-lg px-2 py-1.5 text-white/85 hover:bg-white/15">Сегодня</Link>}
        {Object.entries(PERIODS).map(([p, label]) => <Link key={p} href={href(p as CalendarPeriod, date)} scroll={false} aria-current={period === p ? "page" : undefined} className={`rounded-lg px-2.5 py-1.5 transition ${period === p ? "bg-white/20 font-semibold text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>{label}</Link>)}
      </nav>}
    </div>
    {err && <p role="alert" className="mb-2.5 rounded-2xl bg-bad-soft px-4 py-2 text-xs text-bad">{err}</p>}
    {view === "list" ? <div className="space-y-2">
      {inPeriod.length === 0 && <p className="rounded-2xl bg-surface px-5 py-10 text-center text-sm text-ink2">В этом периоде материалов нет. Измените фильтры или добавьте идею.</p>}
      {[...inPeriod].sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`)).map((it) => <div key={it.id} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-xl bg-surface p-2"><time className="pl-2 text-xs tabular-nums text-ink2">{shortDay(it.date)}</time>{event(it)}</div>)}
    </div> : period === "year" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {MONTHS.map((name, i) => { const mon = `${date.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`; const count = items.filter((x) => x.date.startsWith(mon)).length;
        return <section key={mon} className="rounded-2xl bg-surface p-3"><Link href={href("month", `${mon}-01`)} scroll={false} className="mb-3 flex items-center justify-between rounded-lg px-1 py-1 text-sm font-semibold hover:bg-tile"><span>{name}</span><span className="text-xs font-normal text-ink3">{count} мат.</span></Link>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ink3">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">{monthCells(mon).map((day) => { const list = by.get(day) ?? [], outside = !day.startsWith(mon);
            return <Link key={day} href={href("day", day)} scroll={false} aria-label={`${day}, материалов: ${list.length}`} title={`${shortDay(day)} · материалов: ${list.length}`} className={`flex min-h-9 flex-col items-center justify-center gap-1 rounded-lg text-xs tabular-nums hover:ring-1 hover:ring-accent ${day === today ? "bg-accent text-white" : outside ? "text-ink3/50" : list.length ? "bg-accent-soft text-ink" : "text-ink2"}`}><span>{Number(day.slice(-2))}</span><span className="flex h-1 gap-0.5">{list.slice(0, 3).map((it) => <span key={it.id} className="size-1 rounded-full" style={{ backgroundColor: calendarColor(it.color)?.value ?? "var(--accent)" }} />)}</span></Link>;
          })}</div></section>;
      })}</div> : period === "month" ? monthGrid(month) : <div ref={timeline} className="max-h-[700px] overflow-auto rounded-xl">
      <div style={{ minWidth: period === "week" ? 760 : undefined }}>
        <div className="sticky top-0 z-10 grid bg-tile" style={{ gridTemplateColumns: `3.5rem repeat(${range.days.length}, minmax(0, 1fr))` }}>
          <div className="grid place-items-center border-b border-line p-2 text-ink3"><Clock3 size={16} /></div>
          {range.days.map((day, i) => <Link key={day} href={href("day", day)} scroll={false} className={`border-b border-line px-2 py-3 text-center text-xs ${day === today ? "font-semibold text-accent" : "text-ink2"}`}>{WEEKDAYS[(new Date(day).getUTCDay() + 6) % 7]} · {shortDay(day)}</Link>)}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${range.days.length}, minmax(0, 1fr))` }}>
          <div className="sticky top-10 z-10 border-b border-line bg-tile px-1 py-3 text-[10px] text-ink3">Без времени</div>
          {range.days.map((day) => <div key={day} {...drop(day)} className={`sticky top-10 z-10 min-h-16 max-h-40 space-y-1 overflow-y-auto border-b border-l border-line bg-tile p-1.5 ${over === day ? "bg-accent-soft" : ""}`}>{(by.get(day) ?? []).filter((it) => !it.time).map((it) => event(it))}</div>)}
          {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="contents"><time className="min-h-16 border-b border-line px-2 py-2 text-[11px] tabular-nums text-ink3">{String(hour).padStart(2, "0")}:00</time>{range.days.map((day) => <div key={day} className="min-h-16 space-y-1 border-b border-l border-line p-1.5">{(by.get(day) ?? []).filter((it) => it.time && Number(it.time.slice(0, 2)) === hour).map((it) => event(it))}</div>)}</div>)}
        </div>
      </div>
    </div>}
    <p className="px-2 pb-1 pt-3 text-[11px] text-ink3">Цветная полоса — метка материала, точка — статус. Нажмите на материал для редактирования.{(period === "day" || period === "week") && " Время указано в часовом поясе завода."}</p>
  </section>;
}
