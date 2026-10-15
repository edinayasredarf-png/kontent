"use client";
import { useEffect, useRef } from "react";

/** Короткая зацикленная анимация в карточке: играет только пока карточка видна на экране, чтобы не грузить телефон. */
export function CardVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.35 });
    io.observe(v); return () => io.disconnect();
  }, []);
  return <video ref={ref} className="size-full object-cover" src={src} poster={poster} muted loop playsInline preload="metadata" aria-hidden />;
}
