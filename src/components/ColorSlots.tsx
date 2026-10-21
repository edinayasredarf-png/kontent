"use client";
import { useState } from "react";
import { X } from "lucide-react";

/** Приводит ввод к виду #rrggbb: принимает «#abc», «abc», «AABBCC», «#AABBCC». Пусто или неверно — null. */
export function normHex(v: string): string | null {
  const s = v.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) return "#" + s.split("").map((c) => c + c).join("");
  if (/^[0-9a-f]{6}$/.test(s)) return "#" + s;
  return null;
}

type Slot = { hex: string; name: string };

/**
 * Фирменные цвета: до 6 слотов. Цвет задаётся пипеткой или кодом (HEX), рядом сразу виден образец. Слот включён, пока в нём верный цвет:
 * отдельный флажок не нужен (из-за него выбранный пипеткой цвет раньше не сохранялся). Скрытые поля color_on_i / color_hex_i / color_name_i те же, что ждёт сервер.
 */
export function ColorSlots({ initial, count = 6 }: { initial: { hex: string; name?: string }[]; count?: number }) {
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: count }, (_, i) => ({ hex: initial[i]?.hex ?? "", name: initial[i]?.name ?? "" })));
  const set = (i: number, p: Partial<Slot>) => setSlots((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const bad = slots.some((s) => s.hex.trim() && !normHex(s.hex));

  return (
    <div className="space-y-2">
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
        {slots.map((s, i) => {
          const ok = normHex(s.hex), invalid = !!s.hex.trim() && !ok;
          return (
            <div key={i} className={`flex items-center gap-2 rounded-xl bg-tile p-2 ${invalid ? "ring-1 ring-bad" : ""}`}>
              <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line" style={{ background: ok ?? "transparent" }} title="Выбрать цвет">
                {!ok && <span className="absolute inset-0 grid place-items-center text-lg text-ink3">+</span>}
                <input type="color" value={ok ?? "#029cda"} onChange={(e) => set(i, { hex: e.target.value })} aria-label={`Выбрать цвет ${i + 1}`} className="absolute inset-0 size-full cursor-pointer opacity-0" />
              </label>
              <div className="min-w-0 flex-1 space-y-1">
                <input value={s.hex} onChange={(e) => set(i, { hex: e.target.value })} onBlur={() => { const n = normHex(s.hex); if (n) set(i, { hex: n }); }}
                  placeholder="#RRGGBB" maxLength={9} spellCheck={false} autoCapitalize="off" aria-label={`HEX-код цвета ${i + 1}`} aria-invalid={invalid} className="input !bg-surface !py-1.5 font-mono text-xs uppercase" />
                <input value={s.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Название (необязательно)" maxLength={30} className="input !bg-surface !py-1.5 text-xs" />
              </div>
              {s.hex && <button type="button" onClick={() => set(i, { hex: "", name: "" })} className="grid size-8 shrink-0 place-items-center rounded-full text-ink3 hover:bg-surface hover:text-bad" aria-label="Очистить цвет" title="Очистить"><X size={14} /></button>}
              {ok && <input type="hidden" name={`color_on_${i}`} value="on" />}
              <input type="hidden" name={`color_hex_${i}`} value={ok ?? ""} />
              <input type="hidden" name={`color_name_${i}`} value={s.name} />
            </div>
          );
        })}
      </div>
      {bad && <input type="hidden" name="color_invalid" value="1" />}
      {bad && <p className="text-xs text-bad">Код цвета должен быть вида #RRGGBB или #RGB, например #029CDA.</p>}
    </div>
  );
}
