"use client";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { AutoTextarea } from "./AutoTextarea";
import { AiTextTools } from "./AiTextTools";
import { PollPreview } from "./PostPreview";
import { POLL_MAX, POLL_MIN, type PollMeta } from "@/lib/poll-format";

/** Опрос в окне материала: вводный текст, вопрос, варианты ответа (или открытый вопрос без вариантов) и предпросмотр по площадкам. Поля уходят в форму черновика. */
export function PollEditor({ lead, poll, kinds, name, price }: { lead: string; poll: PollMeta | null; kinds: string[]; name: string; price: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(lead);
  const [question, setQuestion] = useState(poll?.question ?? "");
  const [mode, setMode] = useState<"options" | "open">(poll?.mode === "open" ? "open" : "options");
  const [multi, setMulti] = useState(!!poll?.multi);
  const [opts, setOpts] = useState<string[]>(poll?.options?.length ? poll.options : ["", ""]);
  const apply = (t: string) => { setText(t); const el = ref.current; if (el) { el.value = t; el.dispatchEvent(new Event("input", { bubbles: true })); } };
  const set = (i: number, v: string) => setOpts((a) => a.map((x, n) => (n === i ? v : x)));
  const move = (i: number, d: -1 | 1) => setOpts((a) => { const j = i + d; if (j < 0 || j >= a.length) return a; const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b; });
  const live: PollMeta = { question: question || "Вопрос опроса", options: opts.map((o) => o.trim()).filter(Boolean), mode, multi: mode === "options" && multi };

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Вводный текст (необязательно)</label>
        <AutoTextarea ref={ref} name="body" defaultValue={lead} rows={3} onChange={(e) => setText(e.target.value)} className="input !rounded-2xl !bg-surface text-sm leading-6" />
        <div className="mt-2"><AiTextTools getText={() => ref.current?.value ?? text} setText={apply} price={price} /></div>
      </div>
      <div>
        <label className="label">Вопрос</label>
        <input name="question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={280} required className="input !bg-surface font-medium" placeholder="Например: как вы решаете эту задачу сейчас?" />
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Тип опроса">
        <label className="chip chip-toggle cursor-pointer !px-3 !py-1.5"><input type="radio" name="mode" value="options" checked={mode === "options"} onChange={() => setMode("options")} className="hidden" />С вариантами ответов</label>
        <label className="chip chip-toggle cursor-pointer !px-3 !py-1.5"><input type="radio" name="mode" value="open" checked={mode === "open"} onChange={() => setMode("open")} className="hidden" />Открытый вопрос (без вариантов)</label>
      </div>
      {mode === "options" ? (
        <div className="space-y-2 rounded-2xl bg-surface p-3">
          {opts.map((o, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-center text-xs text-ink3">{i + 1}</span>
              <input name="option" value={o} onChange={(e) => set(i, e.target.value)} maxLength={90} placeholder={`Вариант ${i + 1}`} className="input !bg-tile !py-1.5 text-sm" />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 hover:bg-tile disabled:opacity-30" aria-label="Поднять вариант"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === opts.length - 1} className="rounded p-1 hover:bg-tile disabled:opacity-30" aria-label="Опустить вариант"><ArrowDown size={14} /></button>
              <button type="button" onClick={() => setOpts((a) => a.filter((_, n) => n !== i))} disabled={opts.length <= POLL_MIN} className="rounded p-1 text-bad hover:bg-bad-soft disabled:opacity-30" aria-label="Удалить вариант"><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setOpts((a) => (a.length >= POLL_MAX ? a : [...a, ""]))} disabled={opts.length >= POLL_MAX} className="btn btn-ghost !py-1.5 text-xs"><Plus size={14} />Добавить вариант</button>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink2"><input type="checkbox" name="multi" checked={multi} onChange={(e) => setMulti(e.target.checked)} />Можно выбрать несколько (в Telegram)</label>
          </div>
        </div>
      ) : <p className="rounded-2xl bg-surface p-3 text-xs text-ink3">Вариантов не будет: подписчики отвечают своими словами в комментариях. Подходит, когда нужны мнения, а не голоса.</p>}
      <PollPreview lead={text} poll={live} kinds={kinds} name={name} />
    </div>
  );
}
