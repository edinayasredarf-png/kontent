"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { KIND } from "./ui";
import { moveItemDateAction } from "@/lib/plan-actions";

export interface CalItem { id: string; date: string; kind: string; topic: string; status: string; label?: string; href: string; movable: boolean }

const DOT: Record<string, string> = {
  idea: "bg-ink3", approved: "bg-accent", generating: "bg-warn", ready: "bg-good", scheduled: "bg-accent", published: "bg-good", failed: "bg-bad", rejected: "bg-tile2",
};
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Месячная сетка (неделя с понедельника). Материалы, которые ещё не ушли в публикацию, можно перетащить на другой день. */
export function CalendarGrid({ month, items: initial, prevHref, nextHref }: { month: string; items: CalItem[]; prevHref: string; nextHref: string }) {
  const [items, setItems] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
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
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <Link href={prevHref} className="text-ink2 hover:text-ink" aria-label="Предыдущий месяц"><ChevronLeft size={18} /></Link>
        <b className="text-sm">{MONTHS[m - 1]} {y}</b>
        <Link href={nextHref} className="text-ink2 hover:text-ink" aria-label="Следующий месяц"><ChevronRight size={18} /></Link>
      </div>
      {err && <p className="border-b border-line bg-bad-soft px-4 py-2 text-xs text-bad">{err}</p>}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-line text-center text-xs text-ink3">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {cells.slice(0, rows * 7).map((d) => {
              const key = ymd(d), list = by.get(key) ?? [], out = d.getMonth() !== m - 1;
              return (
                <div key={key} onDragOver={(e) => { e.preventDefault(); setOver(key); }} onDragLeave={() => setOver((o) => (o === key ? null : o))}
                  onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, key); }}
                  className={`min-h-24 border-b border-r border-line p-1.5 ${over === key ? "bg-accent-soft" : out ? "bg-tile/40" : ""}`}>
                  <div className={`mb-1 text-xs ${key === today ? "grid size-5 place-items-center rounded-full bg-accent text-white" : out ? "text-ink3" : "text-ink2"}`}>{d.getDate()}</div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((it) => (
                      <Link key={it.id} href={it.href} draggable={it.movable} onDragStart={(e) => { e.dataTransfer.setData("text/plain", it.id); e.dataTransfer.effectAllowed = "move"; }} title={`${it.label ? it.label + ": " : ""}${it.topic}${it.movable ? " (можно перетащить)" : ""}`} className={`${it.movable ? "cursor-grab active:cursor-grabbing " : ""}flex items-center gap-1 rounded-md bg-tile px-1.5 py-0.5 text-[11px] leading-tight hover:bg-tile2`}>
                        <span className={`size-1.5 shrink-0 rounded-full ${DOT[it.status] ?? "bg-ink3"}`} /><span className="shrink-0 text-ink3">{KIND[it.kind]?.slice(0, 3)}</span><span className="truncate">{it.topic}</span>
                      </Link>
                    ))}
                    {list.length > 3 && <p className="px-1 text-[11px] text-ink3">ещё {list.length - 3}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
