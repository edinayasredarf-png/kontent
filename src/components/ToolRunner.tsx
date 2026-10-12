"use client";
import { useRef, useState } from "react";
import { BookmarkPlus, Download, ImagePlus, Loader2, Plus } from "lucide-react";
import type { Field, Out } from "@/lib/studio";
import { runToolAction, saveToBankAction } from "@/lib/studio-actions";
import { CopyText } from "./CopyText";

import { SubmitButton } from "@/components/SubmitButton";
/** Сжимаем картинку в браузере до ~1100 px и JPEG: она уходит в запросе строкой data:, поэтому должна быть небольшой. */
async function toDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1100 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export function ToolRunner({ tool, fields, brands, priceLabel, free, kind }: { tool: string; fields: Field[]; brands: { id: string; name: string }[]; priceLabel: string; free: boolean; kind: "text" | "image" | "audio" }) {
  const form = useRef<HTMLFormElement>(null);
  const [results, setResults] = useState<Out[]>([]);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Record<string, string>>({});

  async function generate() {
    if (!form.current || pending) return;
    if (!form.current.reportValidity()) return;
    setPending(true); setError("");
    try {
      const r = await runToolAction(tool, null, new FormData(form.current));
      if (r.error) setError(r.error);
      else setResults((prev) => { setActive(prev.length); return [...prev, r]; });
    } catch (e) { setError((e as Error).message || "Не удалось выполнить запрос"); }
    setPending(false);
  }
  const res = results[active];
  const price = free ? "бесплатно" : priceLabel;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form ref={form} onSubmit={(e) => { e.preventDefault(); generate(); }} className="card space-y-4 p-5">
        {fields.map((f) => (
          <div key={f.name}>
            <label className="label">{f.label}</label>
            {f.type === "textarea" ? <textarea name={f.name} required={f.required} rows={f.rows ?? 3} maxLength={f.max} placeholder={f.placeholder} className="input" />
              : f.type === "text" ? <input name={f.name} required={f.required} maxLength={f.max} placeholder={f.placeholder} className="input" />
              : f.type === "image" ? (
                <div>
                  <input type="hidden" name={f.name} value={preview[f.name] ?? ""} required={f.required} />
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line bg-tile p-3 text-sm text-ink2 hover:bg-tile2">
                    {preview[f.name] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview[f.name]} alt="" className="size-16 rounded-lg object-cover" /> : <ImagePlus size={20} />}
                    <span>{preview[f.name] ? "Заменить изображение" : "Выберите изображение (JPG, PNG, WebP)"}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      try { const url = await toDataUrl(file); setPreview((p) => ({ ...p, [f.name]: url })); setError(""); } catch { setError("Не удалось открыть изображение"); }
                    }} />
                  </label>
                </div>)
              : <select name={f.name} className="input">{(f.name === "brand" ? [["", "Без бренда"] as [string, string], ...brands.map((b) => [b.id, b.name] as [string, string])] : f.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          </div>
        ))}
        <SubmitButton className="btn btn-accent" disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}{kind === "text" && tool === "random" ? "Выбрать победителя" : "Создать"} · {price}</SubmitButton>
        {kind === "image" && <p className="text-xs text-ink3">Генерация занимает до минуты. Нужна модель изображений в «Настройках ИИ».</p>}
      </form>
      <div className="card min-h-40 p-5">
        {pending && <p className="mb-3 flex items-center gap-2 text-sm text-ink2"><Loader2 size={15} className="animate-spin" />Работаем…</p>}
        {error && <p className="mb-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        {!pending && !error && !res && <p className="text-sm text-ink3">Результат появится здесь.</p>}
        {res?.assetId && res.mime?.startsWith("image/") && (<>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/assets/${res.assetId}`} alt="Результат" className="mb-3 max-h-[28rem] w-auto max-w-full rounded-xl border border-line" />
          <a href={`/api/assets/${res.assetId}?dl=1`} className="btn btn-ghost mr-2"><Download size={15} />Скачать</a><span className="text-xs text-ink3">Сохранено в библиотеке</span>
          {res.text && <details className="mt-3 text-xs text-ink2"><summary className="cursor-pointer">Промпт модели</summary><p className="mt-1 whitespace-pre-wrap">{res.text}</p></details>}
        </>)}
        {res?.assetId && res.mime?.startsWith("audio/") && (<>
          <audio controls src={`/api/assets/${res.assetId}`} className="mb-3 w-full" />
          <a href={`/api/assets/${res.assetId}?dl=1`} className="btn btn-ghost mr-2"><Download size={15} />Скачать mp3</a><span className="text-xs text-ink3">Сохранено в библиотеке</span>
        </>)}
        {res?.text && !res.mime && (<>
          <div className="max-h-[32rem] overflow-auto whitespace-pre-wrap text-sm leading-relaxed">{res.text}</div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {results.length > 0 && <div className="flex items-center gap-1">{results.map((_, i) => <button key={i} type="button" onClick={() => setActive(i)} aria-label={`Вариант ${i + 1}`} className={`grid size-8 place-items-center rounded-full text-sm font-semibold ${i === active ? "bg-accent text-white" : "bg-tile hover:bg-tile2"}`}>{i + 1}</button>)}</div>}
            {tool !== "random" && <button type="button" onClick={generate} disabled={pending} className="btn btn-ghost !py-1.5" title="Сгенерировать ещё один вариант с теми же данными"><Plus size={14} />Вариант{free ? "" : ` · ${priceLabel}`}</button>}
            <span className="ml-auto flex gap-2">
              <CopyText text={res.text} label="Копировать" />
              <form action={saveToBankAction}><input type="hidden" name="body" value={res.text} /><input type="hidden" name="source" value={tool} /><SubmitButton className="btn btn-ghost !py-1.5"><BookmarkPlus size={14} />Сохранить</SubmitButton></form>
            </span>
          </div>
        </>)}
      </div>
    </div>
  );
}
