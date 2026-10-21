"use client";
import { useState } from "react";
import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { aiEditTextAction } from "@/lib/text-actions";

const OPS: [string, string][] = [["shorten", "Сократить"], ["expand", "Увеличить"], ["fix", "Исправить ошибки"], ["polish", "Улучшить"], ["simple", "Проще"], ["hook", "Цепляющее начало"], ["formal", "Деловой тон"], ["friendly", "Дружелюбный тон"]];

/**
 * Панель ИИ-правки текста: быстрые команды и своя инструкция. Работает с любым полем через getText/setText.
 * Результат сразу попадает в поле, предыдущий вариант хранится: кнопка «Вернуть» возвращает его.
 */
export function AiTextTools({ getText, setText, price }: { getText: () => string; setText: (t: string) => void; price: string }) {
  const [busy, setBusy] = useState("");
  const [custom, setCustom] = useState("");
  const [prev, setPrev] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (op: string, instruction?: string) => {
    const before = getText();
    setBusy(op); setMsg(null);
    const r = await aiEditTextAction(before, op, instruction).catch(() => null);
    setBusy("");
    if (r?.ok) { setPrev(before); setText(r.text); if (op === "custom") setCustom(""); setMsg({ ok: true, text: "Готово. Можно вернуть прежний вариант." }); }
    else setMsg({ ok: false, text: r && !r.ok ? r.error : "Не удалось выполнить" });
  };
  return (
    <div className="space-y-2 rounded-2xl bg-tile p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 pr-1 text-xs font-semibold text-ink2"><Sparkles size={13} />Доработать ИИ{price ? <span className="font-normal text-ink3"> · {price}</span> : null}</span>
        {OPS.map(([k, l]) => (
          <button key={k} type="button" disabled={!!busy} onClick={() => run(k)} className="chip chip-toggle cursor-pointer !px-2.5 !py-1 text-xs">{busy === k && <Loader2 size={12} className="mr-1 animate-spin" />}{l}</button>
        ))}
        {prev !== null && <button type="button" onClick={() => { setText(prev); setPrev(null); setMsg(null); }} className="chip cursor-pointer !px-2.5 !py-1 text-xs"><Undo2 size={12} className="mr-1" />Вернуть</button>}
      </div>
      <div className="flex gap-2">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (custom.trim().length >= 3) void run("custom", custom); } }} maxLength={400}
          placeholder="Своя команда: например «сделай короче для Telegram» или «добавь призыв записаться»" className="input !bg-surface !py-1.5 text-xs" />
        <button type="button" disabled={!!busy || custom.trim().length < 3} onClick={() => run("custom", custom)} className="btn btn-ghost !py-1.5 text-xs">{busy === "custom" && <Loader2 size={13} className="animate-spin" />}Выполнить</button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
