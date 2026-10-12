"use client";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { testStyleAction } from "@/lib/kb/actions";
import { pendingStore } from "@/lib/pending-store";

/** Пробный пост по базе знаний: сразу видно, получается ли «наш» стиль. */
export function StyleTest({ brandId, price }: { brandId: string; price: string }) {
  const [topic, setTopic] = useState(""), [busy, setBusy] = useState(false), [text, setText] = useState(""), [err, setErr] = useState("");
  async function run() {
    setBusy(true); setErr(""); setText(""); pendingStore.inc();
    try { const r = await testStyleAction(brandId, topic); if (r.error) setErr(r.error); else setText(r.text ?? ""); }
    catch { setErr("Не удалось выполнить"); } finally { pendingStore.dec(); setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Тема для пробного поста" maxLength={300} className="input min-w-0 flex-1" />
        <button type="button" className="btn" disabled={busy || topic.trim().length < 3} onClick={run}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}Написать · {price}</button>
      </div>
      {err && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}
      {text && <div className="whitespace-pre-wrap rounded-xl bg-tile p-4 text-sm leading-relaxed">{text}</div>}
    </div>
  );
}
