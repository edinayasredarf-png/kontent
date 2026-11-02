"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { KIND, STATUS } from "./ui";
import { moveItemDateAction } from "@/lib/plan-actions";

export interface CalItem { id: string; date: string; kind: string; topic: string; status: string; label?: string; href: string; movable: boolean }

const DOT: Record<string, string> = {
  idea: "bg-ink3", approved: "bg-accent", generating: "bg-warn", ready: "bg-good", scheduled: "bg-accent", published: "bg-good", failed: "bg-bad", rejected: "bg-tile2",
};
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Месячная сетка (неделя с понедельника). Материалы, которые ещё не ушли в публикацию, можно перетащить на другой день. */
export function CalendarGrid({ month, items: initial, prevHref, nextHref, view = "calendar" }: { view?: string; month: string; items: CalItem[]; prevHref: string; nextHref: string }) {
  const [items, setItems] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [, run] = useTransition();
  const move = (id: string, date: string) => {
    const it = items.find((x) => x.id === id);
    if (!it || !it.movable || it.date === date) return;
    const prev = it.date;
    setErr(""); setItems((a) => a.map((x) => (x.id === id ? { ...x, date } : x)));
    run(async () => {
      const r = await moveItemDateAction(id, date);
      if (!r.ok) { setItems((a) => a.map((x) => (x.id === id ? { ...x, date: prev } : x))); setErr(r.error); }
    });
  };
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const rows = cells.slice(35).every((d) => d.getMonth() !== m - 1) ? 5 : 6;
  const by = new Map<string, CalItem[]>();
  for (const it of items) by.set(it.date, [...(by.get(it.date) ?? []), it]);
  const today = ymd(new Date());
  const monthItems = items.filter((it) => it.date.startsWith(`${month}-`));
  return (
    <div className="overflow-hidden rounded-[28px] bg-[color-mix(in_srgb,var(--tile)_95%,#b5b2f4)] p-2.5">
      <div className="mb-2.5 flex items-center justify-between rounded-2xl bg-accent px-3 py-2.5 text-white">
        <Link href={prevHref} className="grid size-9 place-items-center rounded-full bg-surface text-ink transition hover:bg-tile2" aria-label="Предыдущий месяц"><ChevronLeft size={18} /></Link>
        <b className="text-base font-semibold">{MONTHS[m - 1]} {y}</b>
        <Link href={nextHref} className="grid size-9 place-items-center rounded-full bg-surface text-ink transition hover:bg-tile2" aria-label="Следующий месяц"><ChevronRight size={18} /></Link>
      </div>
      {err && <p className="mb-2.5 rounded-2xl bg-bad-soft px-4 py-2 text-xs text-bad">{err}</p>}
      {view === "list" ? (
        <div className="space-y-2">
          {monthItems.length === 0 && <p className="rounded-2xl bg-surface px-5 py-10 text-center text-sm text-ink2">В этом месяце материалов нет. Попробуйте изменить фильтры или добавьте идею.</p>}
          {[...monthItems].sort((a, b) => a.date.localeCompare(b.date)).map((it) => <Link key={it.id} href={it.href} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface px-4 py-3 transition hover:bg-tile">
            <time dateTime={it.date} className="text-sm tabular-nums text-ink2">{it.date.split("-").reverse().join(".")}</time>
            <span className={`size-2 shrink-0 rounded-full ${DOT[it.status] ?? "bg-ink3"}`} />
            <span className="min-w-0 flex-1 text-sm break-words">{it.topic}</span>
            <span className="text-xs text-ink2">{it.label} · {KIND[it.kind]} · {STATUS[it.status]?.label ?? it.status}</span>
          </Link>)}
        </div>
      ) : <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 gap-1 pb-1.5 sm:gap-1.5 text-center text-xs font-medium text-ink3">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} className="py-1.5">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {cells.slice(0, rows * 7).map((d) => {
              const key = ymd(d), list = by.get(key) ?? [], out = d.getMonth() !== m - 1;
              return (
                <div key={key} onDragOver={(e) => { e.preventDefault(); setOver(key); }} onDragLeave={() => setOver((o) => (o === key ? null : o))}
                  onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, key); }}
                  className={`min-h-[4.5rem] rounded-xl p-1 transition-colors sm:min-h-24 sm:rounded-2xl sm:p-1.5 ${over === key ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]" : out ? "bg-surface/40" : "bg-surface"}`}>
                  <div className={`mb-1 text-xs ${key === today ? "grid size-6 place-items-center rounded-full bg-accent font-semibold text-white" : out ? "text-ink3" : "font-medium text-ink2"}`}>{d.getDate()}</div>
                  <div className="space-y-1">
                    {(expanded.includes(key) ? list : list.slice(0, 3)).map((it) => (
                      <Link key={it.id} href={it.href} draggable={it.movable} onDragStart={(e) => { e.dataTransfer.setData("text/plain", it.id); e.dataTransfer.effectAllowed = "move"; }} title={`${it.label ? it.label + ": " : ""}${it.topic}${it.movable ? " (можно перетащить)" : ""}`} className={`${it.movable ? "cursor-grab active:cursor-grabbing " : ""}flex items-center gap-1 rounded-lg bg-tile px-1.5 py-1 text-[11px] leading-tight transition hover:bg-tile2`}>
                        <span className={`size-1.5 shrink-0 rounded-full ${DOT[it.status] ?? "bg-ink3"}`} /><span className="shrink-0 text-ink3">{KIND[it.kind]?.slice(0, 3)}</span><span className="min-w-0 truncate">{it.topic}</span>
                      </Link>
                    ))}
                    {list.length > 3 && <button type="button" aria-expanded={expanded.includes(key)} onClick={() => setExpanded((a) => a.includes(key) ? a.filter((x) => x !== key) : [...a, key])} className="px-1 py-1 text-[11px] text-accent-ink hover:underline">{expanded.includes(key) ? "Свернуть" : `Ещё ${list.length - 3}`}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>}
    </div>
  );
}
