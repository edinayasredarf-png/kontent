"use client";
import { useRef, useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function ExternalPostsCarousel({ children, href }: { children: ReactNode; href: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const update = () => setEdges({ start: el.scrollLeft < 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
    const observer = new ResizeObserver(update); observer.observe(el);
    el.addEventListener("scroll", update, { passive: true }); update();
    return () => { observer.disconnect(); el.removeEventListener("scroll", update); };
  }, []);
  const move = (direction: number) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: direction * ((el.firstElementChild?.getBoundingClientRect().width ?? el.clientWidth) + 16), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <section className="mb-6 min-w-0">
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link href={href} className="inline-flex items-center gap-2 rounded-lg text-lg font-semibold hover:text-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Материалы по ссылке<ArrowRight size={19} /></Link>
      <div className="flex shrink-0 gap-2">
        <button type="button" aria-label="Предыдущие материалы" disabled={edges.start} onClick={() => move(-1)} className="pill !p-2 disabled:opacity-30"><ArrowLeft size={18} /></button>
        <button type="button" aria-label="Следующие материалы" disabled={edges.end} onClick={() => move(1)} className="pill !p-2 disabled:opacity-30"><ArrowRight size={18} /></button>
      </div>
    </div>
    <div ref={rail} className="flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-3 [scrollbar-width:thin] [&>a]:w-[min(340px,85vw)] [&>a]:shrink-0 [&>a]:snap-start">{children}</div>
  </section>;
}
