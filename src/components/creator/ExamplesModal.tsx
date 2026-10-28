"use client";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { RefItem } from "@/lib/creator/consts";
import { typeOf } from "@/lib/creator/consts";

export type ExampleRef = RefItem & { kind: string };

/** Галерея примеров: выбранный пример становится референсом, по которому ИИ повторит подачу на вашу тему. */
export function ExamplesModal({ examples, kind, picked, onToggle, onClose }: { examples: ExampleRef[]; kind: string; picked: string[]; onToggle: (r: ExampleRef) => void; onClose: () => void }) {
  const mine = examples.filter((e) => e.kind === kind);
  const [all, setAll] = useState(mine.length === 0);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  const list = all ? examples : mine;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Примеры" onClick={onClose}>
      <div className="flex max-h-[88dvh] w-full max-w-6xl flex-col rounded-3xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          <b className="text-lg">Примеры</b><span className="text-sm text-ink3">станут референсом стиля</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setAll(false)} className={`rounded-full px-3 py-1 text-xs ${!all ? "bg-accent text-white" : "bg-tile text-ink2 hover:bg-tile2"}`}>{typeOf(kind).short}</button>
            <button type="button" onClick={() => setAll(true)} className={`rounded-full px-3 py-1 text-xs ${all ? "bg-accent text-white" : "bg-tile text-ink2 hover:bg-tile2"}`}>Все форматы</button>
            <button type="button" onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1.5 text-ink3 hover:text-ink"><X size={20} /></button>
          </div>
        </div>
        <div className="overflow-auto px-5 pb-5">
          {list.length === 0 ? <p className="py-10 text-center text-sm text-ink2">Для этого формата примеров пока нет. Приложите свой файл или ранее созданный материал кнопкой «+».</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {list.map((e) => { const on = picked.includes(e.id); return (
                <button key={e.id} type="button" onClick={() => onToggle(e)} aria-pressed={on} className={`group overflow-hidden rounded-2xl border bg-tile text-left transition hover:-translate-y-0.5 ${on ? "border-accent ring-2 ring-accent/40" : "border-line"}`}>
                  <div className="relative aspect-[4/5] w-full overflow-hidden" style={e.thumb ? undefined : { background: `linear-gradient(155deg, ${e.grad?.[0] ?? "#52525b"}, ${e.grad?.[1] ?? "#18181b"})` }}>
                    {e.thumb ? <img src={e.thumb} alt={e.title} loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" /> : <span className="absolute inset-0 flex items-end p-3 text-base font-bold leading-tight text-white drop-shadow">{e.title}</span>}
                    {on && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-white"><Check size={14} /></span>}
                    <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{typeOf(e.kind).short}</span>
                  </div>
                  <div className="p-2.5"><span className="block truncate text-sm font-medium">{e.title}</span><span className="mt-0.5 line-clamp-2 text-[11px] text-ink3">{e.text.replace("Структура подачи: ", "") || e.visual}</span></div>
                </button>); })}
            </div>)}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <span className="text-xs text-ink3">{picked.length ? `Выбрано: ${picked.length}. ИИ возьмёт у них стиль и структуру подачи, а тему и факты вы зададите сами.` : "Нажмите на пример, чтобы использовать его как референс (до 3 штук)."}</span>
          <button type="button" className="btn btn-accent" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
