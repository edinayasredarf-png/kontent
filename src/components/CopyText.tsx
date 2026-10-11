"use client";
import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Копирует готовый текст в буфер. icon — компактная иконка (для строки материала), иначе кнопка с подписью. Клик не раскрывает карточку.
 * Если браузер не даёт писать в буфер, открывается окошко с выделенным текстом: остаётся нажать Ctrl+C (⌘C).
 */
export function CopyText({ text, label = "Копировать текст", icon = false }: { text: string; label?: string; icon?: boolean }) {
  const [state, setState] = useState<"idle" | "ok" | "manual">("idle");
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (state === "manual") { area.current?.focus(); area.current?.select(); } }, [state]);
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    let done = false;
    try { await Promise.race([navigator.clipboard.writeText(text), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 800))]); done = true; } // запись в буфер может «зависнуть» без фокуса страницы
    catch {
      try { const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); done = document.execCommand("copy"); t.remove(); } catch { done = false; }
    }
    if (done) { setState("ok"); setTimeout(() => setState("idle"), 1800); } else setState("manual");
  };
  const Icon = state === "ok" ? Check : Copy;
  return (
    <span className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      {icon
        ? <button type="button" onClick={copy} title={state === "ok" ? "Скопировано" : label} aria-label={label} className={`rounded-lg p-1.5 hover:bg-tile ${state === "ok" ? "text-good" : "text-ink3 hover:text-ink"}`}><Icon size={15} /></button>
        : <button type="button" onClick={copy} className="btn btn-ghost !py-1.5"><Icon size={14} />{state === "ok" ? "Скопировано" : label}</button>}
      {state === "manual" && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-line bg-surface p-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 flex items-center justify-between text-xs text-ink2"><span>Нажмите Ctrl+C (⌘C)</span><button type="button" onClick={() => setState("idle")} aria-label="Закрыть" className="rounded p-0.5 hover:bg-tile"><X size={13} /></button></div>
          <textarea ref={area} readOnly value={text} rows={6} className="input !text-xs" />
        </div>
      )}
    </span>
  );
}
