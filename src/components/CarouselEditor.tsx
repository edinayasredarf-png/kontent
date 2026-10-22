"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { rewriteSlidesAction, saveCarouselAction } from "@/lib/carousel/actions";
import { FONT_CATALOG } from "@/lib/fonts-catalog";
import { LAYOUTS, LAYOUT_HINTS, type SlideLayout } from "@/lib/carousel/layouts";

import { SubmitButton } from "@/components/SubmitButton";
interface Slide { title: string; body: string; layout?: SlideLayout; k: number }
const MAX = 10, MIN = 2;

/** Редактор слайдов: правка текстов, порядок, добавление и удаление, своя картинка для обложки. Перерисовка бесплатная. */
export function CarouselEditor({ itemId, factoryId, slides: initial, style, styles, ret, colors = [], design = {}, editPrice = "" }: { itemId: string; factoryId: string; slides: { title: string; body: string; layout?: SlideLayout }[]; style: string; styles: Record<string, string>; ret?: string; colors?: string[]; design?: { color?: string; font?: string; format?: string }; editPrice?: string }) {
  const [slides, setSlides] = useState<Slide[]>(() => initial.map((s, i) => ({ ...s, k: i })));
  const nextKey = useRef(initial.length);
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Set<number>>(new Set()), [ins, setIns] = useState(""), [ai, setAi] = useState(false);
  const [color, setColor] = useState(design.color ?? "");
  const togglePick = (i: number) => setPick((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  async function rewrite() {
    setAi(true); setMsg(null);
    const r = await rewriteSlidesAction(itemId, [...pick], ins, slides.map((x) => ({ title: x.title, body: x.body }))).catch(() => null);
    setAi(false);
    if (r?.ok) { setSlides((a) => a.map((x, n) => { const h = r.slides.find((y) => y.i === n); return h ? { ...x, title: h.title, body: h.body } : x; })); setPick(new Set()); setMsg({ ok: true, text: `Переписано слайдов: ${r.slides.length}. Проверьте тексты и нажмите «Сохранить и перерисовать».` }); }
    else setMsg({ ok: false, text: r && !r.ok ? r.error : "Не удалось выполнить" });
  }
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
        <input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} />{ret && <input type="hidden" name="ret" value={ret} />}
        {slides.map((s, i) => (
          <div key={s.k} className="rounded-xl bg-surface p-2.5">
            <div className="mb-1 flex items-center gap-1 text-xs text-ink3">
              <label className="flex flex-1 cursor-pointer items-center gap-1.5"><input type="checkbox" checked={pick.has(i)} onChange={() => togglePick(i)} aria-label={`Переписать слайд ${i + 1} ИИ`} />{i === 0 ? "Обложка" : i === slides.length - 1 ? `Слайд ${i + 1} — призыв` : `Слайд ${i + 1}`}</label>
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
        <div className="space-y-2 rounded-xl bg-surface p-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink2"><b>Пересобрать слайды ИИ</b><span className="text-ink3">отметьте слайды галочкой слева</span>
            <button type="button" onClick={() => setPick(new Set(slides.map((_, n) => n)))} className="chip cursor-pointer !px-2 !py-0.5 text-xs">Все</button>
            {pick.size > 0 && <button type="button" onClick={() => setPick(new Set())} className="chip cursor-pointer !px-2 !py-0.5 text-xs">Снять</button>}</div>
          <div className="flex flex-wrap gap-2">
            <input value={ins} onChange={(e) => setIns(e.target.value)} maxLength={400} placeholder="Что изменить: например «короче», «добавь цифры», «более деловой тон» (необязательно)" className="input !min-w-0 flex-1 !bg-tile !py-1.5 text-xs" />
            <button type="button" onClick={rewrite} disabled={ai || pick.size === 0} className="btn btn-ghost !py-1.5 text-xs">{ai ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Переписать выбранные{pick.size ? ` (${pick.size})` : ""}{editPrice ? ` · ${editPrice}` : ""}</button>
          </div>
        </div>
        <div className="space-y-2.5 rounded-xl bg-surface p-2.5">
          <b className="text-xs text-ink2">Дизайн карусели</b>
          <div className="flex flex-wrap items-center gap-2">
            <select name="style" defaultValue={style} aria-label="Стиль" className="input !w-auto !py-1.5 text-xs">{Object.entries(styles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select name="design_format" defaultValue={design.format ?? ""} aria-label="Формат слайдов" className="input !w-auto !py-1.5 text-xs"><option value="">Формат как в настройках</option><option value="portrait">Вертикальный 4:5</option><option value="square">Квадрат 1:1</option></select>
            <select name="design_font" defaultValue={design.font ?? ""} aria-label="Шрифт" className="input !w-auto !py-1.5 text-xs"><option value="">Шрифт как у бренда</option>{design.font?.startsWith("gf:") && <option value={design.font}>{design.font.slice(3)} (Google Fonts)</option>}{FONT_CATALOG.map((f) => <option key={f.slug} value={f.slug}>{f.name}</option>)}</select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink2">Основной цвет:
            <input type="hidden" name="design_color" value={color} />
            <button type="button" onClick={() => setColor("")} aria-pressed={!color} className={`rounded-full border px-2.5 py-1 ${!color ? "border-accent bg-accent-soft text-accent-ink" : "border-line"}`}>Как у бренда</button>
            {colors.map((h) => <button key={h} type="button" onClick={() => setColor(h)} aria-pressed={color === h} aria-label={`Цвет ${h}`} title={h} className={`size-7 rounded-full border-2 ${color === h ? "border-accent" : "border-line"}`} style={{ background: h }} />)}
            <label className="relative size-7 cursor-pointer overflow-hidden rounded-full border border-line" title="Свой цвет" style={{ background: color && !colors.includes(color) ? color : "conic-gradient(red,yellow,lime,aqua,blue,magenta,red)" }}><input type="color" value={color || "#029cda"} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Свой цвет" /></label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={add} disabled={slides.length >= MAX} className="btn btn-ghost !py-1.5"><Plus size={14} />Добавить слайд</button>
          <SubmitButton className="btn"><RefreshCw size={14} />Сохранить и перерисовать</SubmitButton>
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
