"use client";
import { useEffect, useRef } from "react";

/**
 * Лента карточек с мягкой анимацией при прокрутке: у верхнего и нижнего края окна карточки уходят в полупрозрачность
 * и слегка смещаются. Включается только если пользователь не отключил анимацию в системе.
 */
export function FadeList({ children, topEdge = 96, className = "" }: { children: React.ReactNode; topEdge?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const vh = window.innerHeight, top = topEdge, fadeTop = 150, fadeBottom = 200;
      for (const c of Array.from(el.children) as HTMLElement[]) {
        const r = c.getBoundingClientRect();
        // сверху: чем выше нижний край карточки ушёл под шапку, тем прозрачнее; снизу: чем ниже верхний край, тем прозрачнее
        const up = Math.min(1, Math.max(0, (r.bottom - top) / fadeTop));
        const down = Math.min(1, Math.max(0, (vh - r.top - 24) / fadeBottom));
        const o = Math.min(up, down);
        c.style.opacity = String(0.05 + 0.95 * o);
        c.style.transform = `translateY(${(down < up ? (1 - down) * 28 : -(1 - up) * 18).toFixed(1)}px) scale(${(0.97 + 0.03 * o).toFixed(3)})`;
      }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    const mo = new MutationObserver(on); mo.observe(el, { childList: true, subtree: true });
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [topEdge]);
  return <div ref={box} className={className}>{children}</div>;
}
