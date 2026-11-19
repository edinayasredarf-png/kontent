"use client";
import { useEffect, useState } from "react";
export function ExternalPostMedia({ id, count, unchecked, compact = false }: { id: string; count: number; unchecked: boolean; compact?: boolean }) {
  const [total, setTotal] = useState(count);
  useEffect(() => {
    if (!unchecked) { setTotal(count); return; }
    const controller = new AbortController();
    fetch(`/api/external-media/${id}?meta=1`,{signal:controller.signal}).then(r => r.ok ? r.json() : null).then(data => { if (data && Number.isInteger(data.count)) setTotal(data.count); }).catch(() => {});
    return () => controller.abort();
  },[id,count,unchecked]);
  const [failed, setFailed] = useState<number[]>([]);
  const indexes = Array.from({length: Math.min(compact ? 1 : 10, total)}, (_,i) => i).filter(i => !failed.includes(i));
  if (!indexes.length) return null;
  return <div className={`mt-3 grid gap-2 ${indexes.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{indexes.map(index =>
    // eslint-disable-next-line @next/next/no-img-element
    <img key={index} src={`/api/external-media/${id}?index=${index}`} loading="lazy" alt={`Изображение поста ${index + 1}`} onError={() => setFailed(previous => [...previous,index])} className={`w-full rounded-xl bg-surface object-contain ${compact ? "aspect-[4/3] max-h-60 !object-cover" : "max-h-[560px]"}`} />
  )}</div>;
}
