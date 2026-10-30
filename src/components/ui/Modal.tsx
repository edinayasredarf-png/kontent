"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Окно справа во всю высоту экрана: лёгкое затемнение, закрытие по Esc и клику вне окна, блокировка прокрутки страницы, фокус внутри окна. */
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
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Закрыть" onClick={onClose} className={`absolute inset-0 cursor-default bg-[#0b1030]/30 ${closing ? "animate-[backdrop-out_.2s_ease-in_forwards]" : ""}`} />
      <div ref={box} tabIndex={-1} style={{ boxShadow: "0 0 12px rgba(0,8,50,.16)" }} className={`absolute right-0 top-0 flex h-full w-full flex-col overflow-hidden bg-surface outline-none ${closing ? "animate-[drawer-out_.2s_ease-in_forwards]" : "animate-[drawer-in_.24s_ease-out]"} ${wide ? "max-w-[760px]" : "max-w-[600px]"}`}>
        <div className="flex h-14 shrink-0 items-start justify-end px-4 pt-4">
          <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-8 place-items-center rounded-xl text-ink2 hover:bg-ink/[.06] hover:text-ink"><X size={20} /></button>
        </div>
        <h2 className="shrink-0 px-6 pb-5 text-2xl font-medium leading-8 text-ink sm:px-10">{title}</h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 sm:px-10">{children}</div>
        {footer && <footer className="shrink-0 border-t border-line bg-surface px-6 py-4 sm:px-10">{footer}</footer>}
      </div>
    </div>, document.body);
}
