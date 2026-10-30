"use client";
import { useEffect, useState } from "react";
import { ArrowUp, MessageSquare, X } from "lucide-react";

/**
 * Строка вопроса по новостному фонду. На широком экране закреплена справа от ленты вместе с шапкой,
 * на узком и в мобильной версии сворачивается в круглую кнопку запроса в углу, по нажатию открывается строка.
 */
export function AskBox() {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [open]);
  const form = (autoFocus: boolean) => (
    <form action="/app" className="rounded-3xl bg-tile p-2">
      <input name="q" required maxLength={1500} autoFocus={autoFocus} placeholder="Спросите по новостному фонду или создайте материал" aria-label="Вопрос ассистенту" className="block h-9 w-full bg-transparent px-1 text-base outline-none placeholder:text-ink3" />
      <div className="mt-1 flex justify-end">
        <button type="submit" aria-label="Отправить в чат" className="grid size-9 place-items-center rounded-full bg-accent text-white"><ArrowUp size={18} /></button>
      </div>
    </form>
  );
  return (
    <>
      <div className="sticky top-44 hidden self-start lg:block">{form(false)}</div>
      <div className="lg:hidden">
        {open && <div className="fixed inset-x-3 bottom-24 z-40 shadow-float rounded-3xl bg-surface">{form(true)}</div>}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Закрыть строку запроса" : "Задать вопрос по новостям"} aria-expanded={open} className="fixed bottom-6 right-5 z-40 grid size-14 place-items-center rounded-3xl bg-accent text-white shadow-float">{open ? <X size={26} /> : <MessageSquare size={26} />}</button>
      </div>
    </>
  );
}
