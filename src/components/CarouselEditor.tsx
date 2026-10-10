"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { saveCarouselAction } from "@/lib/carousel/actions";
import { LAYOUTS, LAYOUT_HINTS, type SlideLayout } from "@/lib/carousel/layouts";

interface Slide { title: string; body: string; layout?: SlideLayout; k: number }
const MAX = 10, MIN = 2;

/** Редактор слайдов: правка текстов, порядок, добавление и удаление, своя картинка для обложки. Перерисовка бесплатная. */
export function CarouselEditor({ itemId, factoryId, slides: initial, style, styles }: { itemId: string; factoryId: string; slides: { title: string; body: string; layout?: SlideLayout }[]; style: string; styles: Record<string, string> }) {
  const [slides, setSlides] = useState<Slide[]>(() => initial.map((s, i) => ({ ...s, k: i })));
  const nextKey = useRef(initial.length);
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const edit = (i: number, patch: Partial<Slide>) => setSlides((a) => a.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => setSlides((a) => { const j = i + d; if (j < 0 || j >= a.length) return a; const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b; });
  const remove = (i: number) => setSlides((a) => (a.length <= MIN ? a : a.filter((_, n) => n !== i)));
  const add = () => setSlides((a) => (a.length >= MAX ? a : [...a.slice(0, -1), { title: "", body: "", layout: "text", k: nextKey.current++ }, a[a.length - 1]]));

  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.set("id", itemId); fd.set("file", f);
      const res = await fetch("/api/carousel/cover", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: j.error || `Ошибка ${res.status}` });
      else { setMsg({ ok: true, text: "Обложка обновлена" }); router.refresh(); }
    } catch { setMsg({ ok: false, text: "Не удалось загрузить файл" }); }
    setBusy(false); if (file.current) file.current.value = "";
  }

  return (
    <div className="space-y-3">
      <form action={saveCarouselAction} className="space-y-3">
        <input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} />
        {slides.map((s, i) => (
          <div key={s.k} className="rounded-xl bg-surface p-2.5">
            <div className="mb-1 flex items-center gap-1 text-xs text-ink3">
              <span className="flex-1">{i === 0 ? "Обложка" : i === slides.length - 1 ? `Слайд ${i + 1} — призыв` : `Слайд ${i + 1}`}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 hover:bg-tile disabled:opacity-30" aria-label="Поднять слайд"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === slides.length - 1} className="rounded p-1 hover:bg-tile disabled:opacity-30" aria-label="Опустить слайд"><ArrowDown size={14} /></button>
              <button type="button" onClick={() => remove(i)} disabled={slides.length <= MIN} className="rounded p-1 text-bad hover:bg-bad-soft disabled:opacity-30" aria-label="Удалить слайд"><Trash2 size={14} /></button>
            </div>
            {i > 0 && i < slides.length - 1 && (
              <div className="mb-1.5">
                <select name={`layout_${i}`} value={s.layout ?? "text"} onChange={(e) => edit(i, { layout: e.target.value as SlideLayout })} className="input !w-auto !py-1 text-xs" aria-label="Макет слайда">
                  {Object.entries(LAYOUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <span className="ml-2 text-[11px] text-ink3">{LAYOUT_HINTS[s.layout ?? "text"]}</span>
              </div>
            )}
            <input name={`title_${i}`} value={s.title} onChange={(e) => edit(i, { title: e.target.value })} maxLength={90} placeholder="Заголовок" className="input mb-1.5 !bg-tile font-medium" />
            <textarea name={`body_${i}`} value={s.body} onChange={(e) => edit(i, { body: e.target.value })} rows={2} maxLength={320} placeholder="Текст" className="input !bg-tile text-sm" />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={add} disabled={slides.length >= MAX} className="btn btn-ghost !py-1.5"><Plus size={14} />Добавить слайд</button>
          <select name="style" defaultValue={style} className="input !w-auto">{Object.entries(styles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="btn"><RefreshCw size={14} />Сохранить и перерисовать</button>
          <span className="text-xs text-ink3">бесплатно</span>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className="btn btn-ghost !py-1.5">{busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Своя картинка для обложки</button>
        <span className="text-xs text-ink3">JPG, PNG или WebP до 4 МБ. Слайды перерисуются.</span>
        {msg && <span className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
