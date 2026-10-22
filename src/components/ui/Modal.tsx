"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Модальное окно: затемнение, закрытие по Esc и клику вне окна, блокировка прокрутки страницы, фокус внутри окна. */
export function Modal({ title, onClose, children, wide, footer, closing }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode; closing?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key); box.current?.focus();
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", key); };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Закрыть" onClick={onClose} className={`absolute inset-0 cursor-default bg-[#0b1030]/45 backdrop-blur-[2px] ${closing ? "animate-[backdrop-out_.2s_ease-in_forwards]" : ""}`} />
      <div ref={box} tabIndex={-1} className={`relative flex max-h-[min(88vh,820px)] w-full flex-col overflow-hidden rounded-[28px] bg-surface shadow-float outline-none ${closing ? "animate-[modal-out_.2s_ease-in_forwards]" : "animate-[modal-in_.22s_ease-out]"} ${wide ? "max-w-[880px]" : "max-w-[560px]"}`}>
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-9 place-items-center rounded-full bg-accent-soft text-ink hover:bg-tile2"><X size={17} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="shrink-0 border-t border-line bg-surface px-6 py-4">{footer}</footer>}
      </div>
    </div>, document.body);
}
