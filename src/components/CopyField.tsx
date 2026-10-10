"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Поле только для чтения с кнопкой «Копировать». Без доступа к буферу выделяет текст, чтобы скопировать вручную. */
export function CopyField({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label="Ссылка" className="input !bg-surface !py-1.5 text-xs" />
      <button type="button" className="btn btn-ghost !px-3 !py-1.5" onClick={async () => { try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* ссылку можно выделить вручную */ } }}>
        {ok ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}
