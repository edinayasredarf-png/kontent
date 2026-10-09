"use client";
import { useActionState } from "react";
import { BookmarkPlus, Download, Loader2 } from "lucide-react";
import type { Field, Out } from "@/lib/studio";
import { runToolAction, saveToBankAction } from "@/lib/studio-actions";

export function ToolRunner({ tool, fields, brands, priceLabel, free, kind }: { tool: string; fields: Field[]; brands: { id: string; name: string }[]; priceLabel: string; free: boolean; kind: "text" | "image" | "audio" }) {
  const [res, run, pending] = useActionState(runToolAction.bind(null, tool), {} as Out);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form action={run} className="card space-y-4 p-5">
        {fields.map((f) => (
          <div key={f.name}>
            <label className="label">{f.label}</label>
            {f.type === "textarea" ? <textarea name={f.name} required={f.required} rows={f.rows ?? 3} maxLength={f.max} placeholder={f.placeholder} className="input" />
              : <select name={f.name} className="input">{(f.name === "brand" ? [["", "Без бренда"] as [string, string], ...brands.map((b) => [b.id, b.name] as [string, string])] : f.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          </div>
        ))}
        <button className="btn btn-accent" disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}Создать · {free ? "бесплатно" : priceLabel}</button>
        {kind === "image" && <p className="text-xs text-ink3">Генерация занимает до минуты. Нужна модель изображений в «Настройках ИИ».</p>}
      </form>
      <div className="card min-h-40 p-5">
        {pending && <p className="flex items-center gap-2 text-sm text-ink2"><Loader2 size={15} className="animate-spin" />Работаем…</p>}
        {!pending && !res.error && !res.text && !res.assetId && <p className="text-sm text-ink3">Результат появится здесь.</p>}
        {res.error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{res.error}</p>}
        {res.assetId && res.mime?.startsWith("image/") && (<>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/assets/${res.assetId}`} alt="Результат" className="mb-3 max-h-[28rem] w-auto max-w-full rounded-xl border border-line" />
          <a href={`/api/assets/${res.assetId}?dl=1`} className="btn btn-ghost mr-2"><Download size={15} />Скачать</a><span className="text-xs text-ink3">Сохранено в библиотеке</span>
          {res.text && <details className="mt-3 text-xs text-ink2"><summary className="cursor-pointer">Промпт модели</summary><p className="mt-1 whitespace-pre-wrap">{res.text}</p></details>}
        </>)}
        {res.assetId && res.mime?.startsWith("audio/") && (<>
          <audio controls src={`/api/assets/${res.assetId}`} className="mb-3 w-full" />
          <a href={`/api/assets/${res.assetId}?dl=1`} className="btn btn-ghost mr-2"><Download size={15} />Скачать mp3</a><span className="text-xs text-ink3">Сохранено в библиотеке</span>
        </>)}
        {res.text && !res.mime && (<>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{res.text}</div>
          <form action={saveToBankAction} className="mt-4 flex gap-2">
            <input type="hidden" name="body" value={res.text} /><input type="hidden" name="source" value={tool} />
            <button className="btn btn-ghost"><BookmarkPlus size={15} />В банк идей</button>
          </form>
        </>)}
      </div>
    </div>
  );
}
