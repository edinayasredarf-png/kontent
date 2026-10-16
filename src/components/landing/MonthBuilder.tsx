"use client";
import { useEffect, useRef, useState } from "react";

const POSTS = 30, CAROUSELS = 8, CYCLE = 11_000;
const POST_COL = ["#1734fc", "#bef264", "#a5b4fc", "#fb923c"];

/** «Месяц контента собирается»: 30 постов и 8 каруселей по очереди попадают на полку, сумма растёт до ≈ 900 ₽. Зациклено, играет только пока блок виден. */
export function MonthBuilder() {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(CYCLE * 0.62); // до первого показа и при «меньше движения» виден почти итоговый вид
  useEffect(() => {
    const el = box.current; if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setT(CYCLE * 0.78); return; }
    let raf = 0, start = 0, live = false;
    const tick = (now: number) => { if (!start) start = now; setT((now - start) % CYCLE); raf = requestAnimationFrame(tick); };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !live) { live = true; start = 0; raf = requestAnimationFrame(tick); }
      else if (!e.isIntersecting && live) { live = false; cancelAnimationFrame(raf); }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  // 0–5.5 c: посты, 5.5–8 c: карусели, до 10 c: держим итог, затем всё плавно гаснет
  const posts = Math.min(POSTS, Math.floor((t / 5500) * POSTS));
  const cars = t < 5500 ? 0 : Math.min(CAROUSELS, Math.floor(((t - 5500) / 2500) * CAROUSELS));
  const sum = Math.round(900 * Math.min(1, (posts / POSTS) * 0.68 + (cars / CAROUSELS) * 0.32));
  const fade = t > 10_000 ? 1 - (t - 10_000) / 1000 : 1;
  return (
    <div ref={box} className="mt-5 rounded-2xl bg-white/80 p-4 shadow-[0_8px_24px_-14px_rgba(23,52,252,.35)]" aria-hidden>
      <div className="grid grid-cols-10 gap-1.5" style={{ opacity: fade }}>
        {Array.from({ length: POSTS }, (_, i) => (
          <i key={i} className="aspect-square rounded-md" style={{ background: i < posts ? POST_COL[i % 4] : "#ececf6", transform: i < posts ? "scale(1)" : "scale(.8)", transition: "transform .25s cubic-bezier(.3,1.6,.5,1), background .2s" }} />
        ))}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3" style={{ opacity: fade }}>
        <div className="flex gap-2">
          {Array.from({ length: CAROUSELS }, (_, i) => (
            <span key={i} className="relative block h-8 w-6" style={{ transform: i < cars ? "scale(1)" : "scale(.6)", opacity: i < cars ? 1 : .25, transition: "transform .3s cubic-bezier(.3,1.6,.5,1), opacity .2s" }}>
              <i className="absolute inset-0 rounded-md bg-[#a5b4fc]" style={{ transform: "translate(-3px,-2px) rotate(-8deg)" }} />
              <i className="absolute inset-0 rounded-md bg-[#bef264]" style={{ transform: "translate(0,0)" }} />
              <i className="absolute inset-0 rounded-md bg-[#1734fc]" style={{ transform: "translate(3px,2px) rotate(8deg)" }} />
            </span>
          ))}
        </div>
        <p className="text-right text-xs font-semibold leading-4 text-neutral-900/70"><b className="block text-lg text-blue-900 tabular-nums">≈ {sum} ₽</b>{posts} постов, {cars} каруселей</p>
      </div>
    </div>
  );
}
