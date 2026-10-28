"use client";
import { useEffect, useState } from "react";

const PHRASES = ["Читаю задачу…", "Подбираю композицию…", "Расставляю акценты там, где взгляд остановится", "Прорисовываю детали…", "Подгоняю цвета под бренд…", "Собираю слайд целиком…"];

/** «Колба» с наливающейся жидкостью: процент считаем по времени (модель не сообщает прогресс) и дотягиваем до 100, когда слайд готов. */
export function GenOrb({ startedAt, typical = 45, label }: { startedAt: number; typical?: number; label?: string }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); setNow(Date.now()); return () => clearInterval(t); }, [startedAt]);
  const sec = Math.max(0, (now - startedAt) / 1000);
  const pct = Math.min(95, Math.round(95 * (1 - Math.exp((-sec / typical) * 1.5))));
  const y = 100 - pct * 0.92 - 4;
  const wave = "M0 6 Q12.5 0 25 6 T50 6 T75 6 T100 6 T125 6 T150 6 T175 6 T200 6 V120 H0 Z";
  const over = sec > typical * 1.8;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center" role="status" aria-live="polite">
      <div className="relative size-28">
        <div className="orb-glow absolute -inset-4 rounded-full bg-accent/30 blur-2xl" />
        <svg viewBox="0 0 100 100" className="relative size-full">
          <defs><clipPath id="orb-clip"><circle cx="50" cy="50" r="46" /></clipPath></defs>
          <circle cx="50" cy="50" r="46" className="fill-tile" />
          <g clipPath="url(#orb-clip)">
            <g style={{ transform: `translateY(${y}px)`, transition: "transform .6s ease" }}>
              <g className="orb-wave2" style={{ transformBox: "fill-box" }}><path d={wave} className="fill-accent" fillOpacity=".35" /></g>
              <g className="orb-wave" style={{ transformBox: "fill-box" }}><path d={wave} className="fill-accent" fillOpacity=".8" /></g>
            </g>
          </g>
          <circle cx="50" cy="50" r="46" fill="none" className="stroke-line" strokeWidth="1.5" />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-xl font-semibold tabular-nums text-ink drop-shadow">{pct}%</span>
      </div>
      <p key={Math.floor(sec / 7) % PHRASES.length} className="orb-phrase max-w-[16rem] text-xs text-ink2">{label ?? PHRASES[Math.floor(sec / 7) % PHRASES.length]}</p>
      <p className="text-[11px] text-ink3">{over ? "Модель думает дольше обычного, ещё немного…" : `${Math.floor(sec)} сек · обычно ~${typical} сек`}</p>
    </div>
  );
}
