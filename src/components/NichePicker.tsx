"use client";
import { useState } from "react";
import { Wand2 } from "lucide-react";

export interface NichePreset { key: string; name: string; values: Record<string, string>; checks?: Record<string, string[]> }

/** Выбор готового шаблона ниши: заполняет поля формы, где он стоит. Пользователь может всё изменить до сохранения. */
export function NichePicker({ presets, hint }: { presets: NichePreset[]; hint: string }) {
  const [key, setKey] = useState("");
  const apply = (k: string, form: HTMLFormElement | null) => {
    setKey(k);
    const p = presets.find((x) => x.key === k);
    if (!p || !form) return;
    for (const [name, v] of Object.entries(p.values)) {
      const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
      if (el) el.value = v;
    }
    for (const [name, vals] of Object.entries(p.checks ?? {})) {
      form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((i) => { i.checked = vals.includes(i.value); });
    }
  };
  return (
    <div className="rounded-2xl border border-dashed border-accent/50 bg-accent-soft/50 p-4">
      <label className="mb-1.5 flex items-center gap-2 text-sm font-medium"><Wand2 size={15} />Быстрый старт: шаблон ниши</label>
      <select className="input" value={key} onChange={(e) => apply(e.target.value, e.currentTarget.form)} aria-label="Шаблон ниши">
        <option value="">Заполнить вручную</option>
        {presets.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      </select>
      <input type="hidden" name="niche_key" value={key} />
      <p className="mt-1.5 text-xs text-ink2">{hint}</p>
    </div>
  );
}
