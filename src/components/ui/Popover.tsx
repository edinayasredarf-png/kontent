"use client";
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Anchored overlay: never participates in the page layout or clips inside a scrolling card. */
export function Popover({ anchor, title, onClose, children, id }: { anchor: RefObject<HTMLElement | null>; title: string; onClose: () => void; children: ReactNode; id?: string }) {
  const box = useRef<HTMLDivElement>(null), close = useRef(onClose);
  close.current = onClose;
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 400, visible: false });
  useLayoutEffect(() => {
    const update = () => {
      const a = anchor.current?.getBoundingClientRect(), p = box.current;
      if (!a || !p) return;
      const gap = 8, edge = 12, below = innerHeight - a.bottom - gap - edge, above = a.top - gap - edge;
      const down = below >= Math.min(p.scrollHeight, 320) || below >= above;
      const maxHeight = Math.max(80, down ? below : above);
      const height = Math.min(p.scrollHeight, maxHeight);
      setPos({ top: down ? a.bottom + gap : Math.max(edge, a.top - gap - height), left: Math.max(edge, Math.min(a.left, innerWidth - p.offsetWidth - edge)), maxHeight, visible: true });
    };
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) close.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close.current(); anchor.current?.focus(); } };
    update();
    const observer = new ResizeObserver(update); if (box.current) observer.observe(box.current);
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key, true);
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key, true); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchor]);
  if (typeof document === "undefined") return null;
  return createPortal(<div ref={box} id={id} role="dialog" aria-label={title} className="fixed z-[80] w-[480px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-float" style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight, visibility: pos.visible ? "visible" : "hidden" }}><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold">{title}</p><button type="button" onClick={onClose} aria-label="Закрыть панель" className="grid size-7 place-items-center rounded-full hover:bg-tile"><X size={16}/></button></div>{children}</div>, document.body);
}
