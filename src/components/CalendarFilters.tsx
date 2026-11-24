"use client";
import { Popover } from "./ui/Popover";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";

/** Фильтры календаря: завод, формат, статус. Изменения применяются сразу, без кнопки «Применить». */
export function CalendarFilters({ month, date, period, factory, kind, status, view = "calendar", path = "/app/calendar", scoped = false, factories, kinds, statuses }: {
  path?: string; scoped?: boolean; date?: string; period?: string; view?: string; month: string; factory: string; kind: string; status: string;
  factories: { value: string; label: string }[]; kinds: { value: string; label: string }[]; statuses: { value: string; label: string }[];
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ factory, kind, status, view });
  useEffect(() => { setV({ factory, kind, status, view }); }, [factory, kind, status, view]);
  const go = (o: Partial<typeof v>) => {
    const n = { ...v, ...o }; setV(n);
    const u = new URLSearchParams({ m: month, ...(date ? { date } : {}), ...(period ? { period } : {}) });
    for (const [k, x] of Object.entries(n)) if (x) u.set(k, x);
    if (scoped) { u.set("tab", "plan"); u.delete("factory"); }
    start(() => router.replace(`${path}?${u}`, { scroll: false }));
  };
  const sel = "input";
  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <select value={v.view} onChange={(e) => go({ view: e.target.value })} aria-label="Вид контент-плана" className="input !w-auto !rounded-lg !py-2.5">
        <option value="calendar">Календарь</option><option value="list">Список</option>
      </select>
      <button ref={anchor} type="button" aria-expanded={open} aria-controls="calendar-filter-fields" onClick={() => setOpen(!open)} className="btn btn-ghost !rounded-lg"><SlidersHorizontal size={15} />Фильтр</button>
      {open && <Popover anchor={anchor} id="calendar-filter-fields" title="Фильтр контент-плана" onClose={() => setOpen(false)}><div className="space-y-3">
      {!scoped && <label className="block space-y-2"><span className="text-sm text-ink2">Завод</span>
      <select value={v.factory} onChange={(e) => go({ factory: e.target.value })} aria-label="Завод" className={sel}><option value="">Все заводы</option>{factories.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>}
      <label className="block space-y-2"><span className="text-sm text-ink2">Формат</span><select value={v.kind} onChange={(e) => go({ kind: e.target.value })} aria-label="Формат" className={sel}><option value="">Все форматы</option>{kinds.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <label className="block space-y-2"><span className="text-sm text-ink2">Статус</span><select value={v.status} onChange={(e) => go({ status: e.target.value })} aria-label="Статус" className={sel}><option value="">Все статусы</option>{statuses.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <button type="button" onClick={() => go({ factory: "", kind: "", status: "" })} className="btn btn-ghost">Сбросить фильтры</button>
      <p className="text-xs text-ink3" role="status">{pending ? "Загружаем материалы…" : "Изменения применяются сразу"}</p>
      </div></Popover>}
      <span className="grid size-4 place-items-center" role="status">{pending && <Loader2 size={16} className="animate-spin text-accent" aria-label="Загружаем" />}</span>
    </div>
  );
}
