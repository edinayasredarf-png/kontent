"use client";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Горизонтальная лента карточек со стрелками под ней. Карточки прилипают к началу при прокрутке. */
export function Rail({ children, label }: { children: React.ReactNode; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const go = (dir: 1 | -1) => {
    const el = box.current; if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };
  return (
    <div>
      <div ref={box} role="group" aria-label={label} className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2">{children}</div>
      <div className="mt-8 flex justify-center">
        <div className="flex items-center gap-2 rounded-full bg-slate-100 p-2">
          <button type="button" onClick={() => go(-1)} aria-label="Назад" className="grid size-10 place-items-center rounded-full bg-white text-black transition hover:bg-slate-50"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => go(1)} aria-label="Вперёд" className="grid size-10 place-items-center rounded-full bg-white text-black transition hover:bg-slate-50"><ChevronRight size={18} /></button>
        </div>
      </div>
    </div>
  );
}
