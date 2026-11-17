"use client";
import { Modal } from "./ui/Modal";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarDays, ListFilter, Loader2, X } from "lucide-react";

export interface FilterSelect { name: string; label: string; all: string; value: string; options: { value: string; label: string }[] }

/**
 * Панель фильтров: быстрые периоды («Сегодня», «Вчера»…), выбор дат в календаре и выпадающие списки.
 * Всё применяется сразу, без кнопки; состояние живёт в адресе страницы (период — r, from, to; списки — по имени).
 */
export function FilterBar({ path, presets, r, from, to, selects, keep = {}, search, compact = false, prefix }: {
  compact?: boolean; prefix?: React.ReactNode; path: string; presets: [string, string][]; r: string; from: string; to: string; selects: FilterSelect[]; keep?: Record<string, string>; search?: { name: string; value: string; placeholder: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState({ r, from, to, sel: { ...Object.fromEntries(selects.map((x) => [x.name, x.value])), ...(search ? { [search.name]: search.value } : {}) } as Record<string, string> });
  useEffect(() => { setS({ r, from, to, sel: { ...Object.fromEntries(selects.map((x) => [x.name, x.value])), ...(search ? { [search.name]: search.value } : {}) } }); }, [r, from, to, selects, search]);
  const [modal, setModal] = useState<"dates" | "filters" | null>(null);
  const [openCal, setOpenCal] = useState(r === "custom");
  const go = (n: typeof s) => {
    setS(n);
    const u = new URLSearchParams(keep);
    if (n.r && n.r !== "all") u.set("r", n.r); else u.set("r", "all");
    if (n.r === "custom") { if (n.from) u.set("from", n.from); if (n.to) u.set("to", n.to); }
    for (const [k, v] of Object.entries(n.sel)) if (v) u.set(k, v);
    start(() => router.replace(`${path}?${u}`, { scroll: false }));
  };
  const filtered = Object.values(s.sel).some(Boolean);
  const chip = (on: boolean) => `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 transition ${on ? "bg-surface font-semibold shadow-sm" : "text-ink2 hover:text-ink"}`;
  const sel = "input !w-auto !py-2 text-sm";
  const fields = (
    <div className="mb-5 w-full max-w-[680px] space-y-3">
      {(!compact || modal === "dates") && <div className="flex flex-wrap items-center justify-center gap-2">
        <nav className="inline-flex max-w-full items-center overflow-x-auto rounded-full bg-tile p-1 text-sm no-scrollbar" aria-label="Период">
          {presets.map(([k, l]) => <button key={k} type="button" aria-pressed={s.r === k} onClick={() => { setOpenCal(false); go({ ...s, r: k }); }} className={chip(s.r === k)}>{l}</button>)}
          <button type="button" aria-pressed={s.r === "custom"} onClick={() => { setOpenCal(true); if (s.r !== "custom" && (s.from || s.to)) go({ ...s, r: "custom" }); else setS({ ...s, r: "custom" }); }} className={chip(s.r === "custom")}><CalendarDays size={14} />Выбрать даты</button>
        </nav>
        {pending && <Loader2 size={16} className="animate-spin text-accent" aria-label="Загружаем" />}
      </div>}
      {(!compact || modal === "dates") && (openCal || s.r === "custom") && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-ink2">с <input type="date" value={s.from} max={s.to || undefined} onChange={(e) => go({ ...s, r: "custom", from: e.target.value })} className="input !w-auto !py-2" aria-label="Начало периода" /></label>
          <label className="flex items-center gap-2 text-ink2">по <input type="date" value={s.to} min={s.from || undefined} onChange={(e) => go({ ...s, r: "custom", to: e.target.value })} className="input !w-auto !py-2" aria-label="Конец периода" /></label>
        </div>
      )}
      {(!compact || modal === "filters") && (selects.length > 0 || search) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {search && <input value={s.sel[search.name] ?? ""} onChange={(e) => setS({ ...s, sel: { ...s.sel, [search.name]: e.target.value } })} onKeyDown={(e) => { if (e.key === "Enter") go(s); }} onBlur={() => { if ((s.sel[search.name] ?? "") !== search.value) go(s); }} placeholder={search.placeholder} aria-label={search.placeholder} maxLength={80} className="input !w-56 !py-2 text-sm" />}
          {selects.map((x) => (
            <select key={x.name} value={s.sel[x.name] ?? ""} onChange={(e) => go({ ...s, sel: { ...s.sel, [x.name]: e.target.value } })} aria-label={x.label} className={sel}>
              <option value="">{x.all}</option>{x.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {filtered && <button type="button" onClick={() => go({ ...s, sel: Object.fromEntries([...selects.map((x) => x.name), ...(search ? [search.name] : [])].map((k) => [k, ""])) })} className="pill pill-sm"><X size={13} />Сбросить</button>}
        </div>
      )}
    </div>
  );
  if (!compact) return fields;
  const icon = "grid size-9 shrink-0 place-items-center rounded-full bg-tile text-ink2 hover:text-ink";
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {prefix}
      <button type="button" aria-label="Выбрать период" title="Выбрать период" onClick={() => setModal("dates")} className={icon}><CalendarDays size={16} /></button>
      <button type="button" aria-label="Фильтры" title="Фильтры" onClick={() => setModal("filters")} className={`${icon} ${filtered ? "!bg-accent-soft !text-accent-ink" : ""}`}><ListFilter size={18} /></button>
      {pending && <Loader2 size={14} className="animate-spin text-accent" aria-label="Загрузка" />}
      {modal && <Modal title={modal === "dates" ? "Период публикаций" : "Фильтры публикаций"} onClose={() => setModal(null)}>{fields}</Modal>}
    </div>
  );

}
