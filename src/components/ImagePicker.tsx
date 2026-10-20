"use client";
import { useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

const MAX_SIDE = 1600;

/** Уменьшает фото перед отправкой: телефонные снимки по 8–12 МБ не проходят в форму, а для поста хватает 1600 px. */
export async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Выберите файл изображения (JPG, PNG или WebP)");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Допустимы только JPG, PNG и WebP");
  const bmp = await createImageBitmap(file).catch(() => { throw new Error("Не удалось прочитать изображение"); });
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.size <= 1_500_000) { bmp.close(); return file; }
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.86));
  if (!blob) throw new Error("Не удалось подготовить изображение");
  return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
}

/**
 * Выбор своего изображения в форме: файл уходит вместе с формой (поле name). Показывает превью и убирается крестиком.
 * Большое фото уменьшается на устройстве до отправки.
 */
export function ImagePicker({ name = "image", label = "Прикрепить своё изображение", hint, className = "" }: { name?: string; label?: string; hint?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null), uid = useId();
  const [url, setUrl] = useState<string | null>(null), [err, setErr] = useState(""), [file, setFile] = useState("");
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; setErr("");
    if (!f) return;
    try {
      const out = await shrink(f);
      const dt = new DataTransfer(); dt.items.add(out); if (input.current) input.current.files = dt.files;
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(out)); setFile(`${f.name} · ${Math.max(1, Math.round(out.size / 1024))} КБ`);
    } catch (x) { setErr((x as Error).message); if (input.current) input.current.value = ""; setUrl(null); }
  };
  const clear = () => { if (input.current) input.current.value = ""; if (url) URL.revokeObjectURL(url); setUrl(null); setFile(""); setErr(""); };
  return (
    <div className={className}>
      <input ref={input} type="file" name={name} accept="image/jpeg,image/png,image/webp" onChange={pick} className="sr-only" id={`img-${uid}`} tabIndex={-1} />
      {url ? (
        <div className="flex items-center gap-3 rounded-2xl bg-tile p-2 pr-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file}</p><p className="text-xs text-ink2">Будет прикреплено к материалу, ИИ его не заменит</p></div>
          <button type="button" onClick={clear} aria-label="Убрать изображение" className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-ink2 hover:text-bad"><X size={15} /></button>
        </div>
      ) : (
        <label htmlFor={`img-${uid}`} className="pill cursor-pointer"><ImagePlus size={16} />{label}</label>
      )}
      {hint && !url && <p className="mt-1.5 text-xs text-ink3">{hint}</p>}
      {err && <p className="mt-1.5 text-xs text-bad">{err}</p>}
    </div>
  );
}
