"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export const rub = (kop: number) => `${(kop / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
export const img = (id: string, dl = false) => `/api/assets/${id}${dl ? "?dl=1" : ""}`;

/** Выпадающая панель над кнопкой (панель создания внизу экрана, поэтому открывается вверх). */
export function Pop({ trigger, children, wide, chevron = true, className = "", label }: { trigger: ReactNode; children: (close: () => void) => ReactNode; wide?: boolean; chevron?: boolean; className?: string; label?: string }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={label} title={label} className={`inline-flex items-center gap-1.5 rounded-xl bg-tile px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-tile2 ${className}`}>{trigger}{chevron && <ChevronDown size={12} className="text-ink3" />}</button>
      {open && <div className={`absolute bottom-full left-0 z-30 mb-2 max-h-80 max-w-[88vw] overflow-auto rounded-2xl border border-line bg-surface p-2 shadow-xl ${wide ? "w-80" : "w-64"}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export const Opt = ({ on, onClick, title, price, hint }: { on: boolean; onClick: () => void; title: string; price?: string; hint?: string }) => (
  <button type="button" onClick={onClick} className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left ${on ? "bg-accent-soft" : "hover:bg-tile"}`}>
    <span className="min-w-0 flex-1"><span className={`block text-sm font-medium ${on ? "text-accent-ink" : ""}`}>{title}{price && <span className="ml-2 text-xs font-normal text-ink3">{price}</span>}</span>{hint && <span className="block text-xs text-ink3">{hint}</span>}</span>
    {on && <Check size={15} className="mt-0.5 shrink-0 text-accent" />}
  </button>
);
