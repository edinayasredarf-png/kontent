"use client";

import { useEffect, useRef, useState } from "react";
import type { Media } from "@/lib/monitor/parse";

/** Telegram media is served through JuicerAI so browsers never need Telegram CDN access. */
export function NewsMedia({ media: initialMedia = [], title, itemId }: { media?: Media[]; title: string; itemId?: string }) {
  const [extra, setExtra] = useState<Media[] | null>(null);
  const media = extra ?? initialMedia;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!itemId || initialMedia.length || !box.current) return;
    const controller = new AbortController();
    const load = () => fetch(`/api/news-media/${itemId}?manifest=1`,{signal:controller.signal}).then(r=>r.ok?r.json():null).then(r=>{if(Array.isArray(r?.media)) setExtra(r.media);}).catch(()=>{});
    if (!("IntersectionObserver" in window)) {void load();return ()=>controller.abort();}
    const observer = new IntersectionObserver(([e])=>{if(e.isIntersecting){observer.disconnect();void load();}},{rootMargin:"300px"});
    observer.observe(box.current);
    return ()=>{observer.disconnect();controller.abort();};
  },[itemId,initialMedia.length]);
  const [failed, setFailed] = useState<string[]>([]);
  const images = media.filter((m) => m.type === "image" && m.url && /^https?:\/\//i.test(m.url)).slice(0, 10);
  const source = (m: Media) => itemId ? `/api/news-media/${itemId}?index=${media.indexOf(m)}` : m.url!;
  const videos = media.filter(m => m.type === "video" && m.url && /^https?:\/\//i.test(m.url)).slice(0, 3);
  const files = media.filter((m) => m.type === "file" && m.url && /^https?:\/\//i.test(m.url)).slice(0, 6);
  if (!images.length && !files.length && !videos.length) return <div ref={box} />;
  return <>{images.length > 0 && <div className={`mb-3 grid overflow-hidden rounded-xl ${images.length > 1 ? "grid-cols-2 gap-0.5" : "grid-cols-1"}`}>
    {images.map((m, i) => failed.includes(m.url!) ? <div key={m.url} role="img" aria-label="Фото недоступно" className="grid min-h-28 place-items-center bg-tile text-xs text-ink3">Фото недоступно</div> : (
      <a key={m.url} href={source(m)} target="_blank" rel="noreferrer noopener" className={images.length % 2 && i === 0 && images.length > 1 ? "col-span-2" : ""}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source(m)} alt={`${title || "Изображение к новости"} — фото ${i + 1}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed((a) => [...a, m.url!])} className={`w-full bg-tile ${images.length > 1 ? "aspect-[4/3] object-cover" : "max-h-[700px] object-contain"}`} />
      </a>
    ))}
  </div>}
  {videos.map(m => <video key={m.url} src={source(m)} controls playsInline preload="none" className="mb-3 max-h-[700px] w-full rounded-xl bg-black" />)}
  {files.length > 0 && <ul className="mb-3 space-y-2">{files.map((file) => <li key={file.url}><a className="inline-flex rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink hover:bg-tile2" href={file.url} target="_blank" rel="noreferrer noopener">{file.name || "Открыть документ"} ↗</a></li>)}</ul>}
  </>;
}
