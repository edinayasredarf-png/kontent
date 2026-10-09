"use client";
import { useRef, useState, useTransition } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { askLiaAction } from "@/lib/lia-actions";

interface Msg { role: "user" | "assistant"; content: string }
const HINTS = ["С чего начать?", "Как подключить Telegram-канал?", "Как сделать картинки к постам?", "Чем отличается завод от студии?"];

export function LiaChat({ free }: { free: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: "Привет! Я Лия. Подскажу, где что находится в платформе и как быстрее запустить контент. Спросите о чём угодно." }]);
  const [text, setText] = useState(""); const [err, setErr] = useState("");
  const [pending, start] = useTransition(); const box = useRef<HTMLDivElement>(null);
  const send = (q: string) => {
    const m = q.trim(); if (!m || pending) return;
    const history = msgs.slice(1); setMsgs((x) => [...x, { role: "user", content: m }]); setText(""); setErr("");
    start(async () => {
      const r = await askLiaAction(history, m);
      if (r.error) setErr(r.error); else if (r.text) setMsgs((x) => [...x, { role: "assistant", content: r.text! }]);
      setTimeout(() => box.current?.scrollTo({ top: 1e6, behavior: "smooth" }), 50);
    });
  };
  return (
    <div className="card flex h-[32rem] flex-col">
      <div ref={box} className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-accent text-white" : "bg-tile"}`}>{m.role === "assistant" && i === 0 && <Sparkles size={14} className="mb-1 text-accent" />}{m.content}</div>
          </div>))}
        {pending && <div className="flex"><div className="rounded-2xl bg-tile px-4 py-2.5 text-sm text-ink2"><Loader2 size={14} className="animate-spin" /></div></div>}
        {err && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}
      </div>
      {msgs.length === 1 && <div className="flex flex-wrap gap-2 px-4 pb-2">{HINTS.map((h) => <button key={h} onClick={() => send(h)} className="chip !px-3 !py-1.5 hover:!bg-accent-soft hover:!text-accent-ink">{h}</button>)}</div>}
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2 border-t border-line p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder={`Спросите Лию${free ? "" : " · 3 ₽ за ответ"}`} className="input" />
        <button className="btn btn-accent" disabled={pending || !text.trim()} aria-label="Отправить"><Send size={15} /></button>
      </form>
    </div>
  );
}
