"use client";

import { useState } from "react";
import type { Media } from "@/lib/monitor/parse";

/** Saved photos are a fallback when Telegram is unavailable; other sources use them directly. */
export function NewsMedia({ media = [], title }: { media?: Media[]; title: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const images = media.filter((m) => m.type === "image" && m.url && /^https?:\/\//i.test(m.url)).slice(0, 10);
  if (!images.length) return null;
  return <div className={`mb-3 grid overflow-hidden rounded-xl ${images.length > 1 ? "grid-cols-2 gap-0.5" : "grid-cols-1"}`}>
    {images.map((m, i) => failed.includes(m.url!) ? <div key={m.url} role="img" aria-label="Фото недоступно" className="grid min-h-28 place-items-center bg-tile text-xs text-ink3">Фото недоступно</div> : (
      <a key={m.url} href={m.url} target="_blank" rel="noreferrer noopener" className={images.length % 2 && i === 0 && images.length > 1 ? "col-span-2" : ""}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.url} alt={`${title || "Изображение к новости"} — фото ${i + 1}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed((a) => [...a, m.url!])} className={`w-full bg-tile ${images.length > 1 ? "aspect-[4/3] object-cover" : "max-h-[700px] object-contain"}`} />
      </a>
    ))}
  </div>;
}
