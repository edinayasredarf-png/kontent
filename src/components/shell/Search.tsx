"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import { SEARCH_ITEMS } from "./nav";

/** Поиск по разделам сервиса: печатаете слово, выбираете раздел (стрелки и Enter тоже работают). */
export function Search() {
  const router = useRouter();
  const [v, setV] = useState(""), [open, setOpen] = useState(false), [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const t = v.trim().toLowerCase();
  const res = t ? SEARCH_ITEMS.filter((x) => (x.label + " " + x.words).toLowerCase().includes(t)).slice(0, 6) : [];
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const go = (href: string) => { setOpen(false); setV(""); router.push(href); };
  return (
    <div ref={box} className="relative">
      {!open && <button type="button" onClick={() => setOpen(true)} aria-label="Поиск по разделам" title="Поиск" className="grid size-10 place-items-center rounded-full text-ink2 hover:bg-ink/[.06]"><SearchIcon size={20} /></button>}
      <label className={`h-10 items-center gap-3 rounded-full bg-surface px-4 text-sm font-medium text-ink2 shadow-soft ${open ? "flex w-56 max-sm:w-40" : "hidden"}`}>
        <SearchIcon size={15} className="shrink-0 text-ink" />
        <input autoFocus={open} value={v} onChange={(e) => { setV(e.target.value); setOpen(true); setI(0); }} onFocus={() => setOpen(true)} placeholder="Поиск" aria-label="Поиск по разделам"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, res.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); } else if (e.key === "Enter" && res[i]) go(res[i].href); else if (e.key === "Escape") setOpen(false); }}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink2" />
      </label>
      {open && t && (
        <ul className="absolute right-0 top-12 z-30 w-72 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-float">
          {res.length ? res.map((r, k) => <li key={r.href}><button type="button" onMouseEnter={() => setI(k)} onClick={() => go(r.href)} className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${k === i ? "bg-accent-soft text-accent-ink" : ""}`}>{r.label}</button></li>) : <li className="px-3 py-2 text-sm text-ink2">Ничего не найдено</li>}
        </ul>
      )}
    </div>
  );
}
