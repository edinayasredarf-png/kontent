"use client";
import { useEffect, useState } from "react";

/**
 * Видео hero: на телефонах (до 768 px) показывается отдельная версия 4:3 с интерфейсом смартфона, на широких экранах — широкая.
 * Нужный файл выбирается после загрузки страницы, поэтому лишний ролик не скачивается. До этого виден кадр-заставка.
 */
export function HeroVideo({ desktop, mobile }: { desktop?: string; mobile?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const m = matchMedia("(max-width: 767px)");
    const pick = () => setSrc((m.matches ? mobile : desktop) ?? desktop ?? mobile ?? null);
    pick(); m.addEventListener("change", pick);
    return () => m.removeEventListener("change", pick);
  }, [desktop, mobile]);
  if (!src) return null;
  return <video key={src} className="absolute inset-0 size-full object-cover" src={src} autoPlay muted loop playsInline preload="metadata" aria-hidden />;
}
