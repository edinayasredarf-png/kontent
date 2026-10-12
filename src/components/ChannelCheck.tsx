"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { checkSavedChannelAction } from "@/lib/actions";

/** Повторная проверка подключённого канала: токен жив, бот на месте. */
export function ChannelCheck({ id }: { id: string }) {
  const [st, setSt] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });
  async function run() {
    setSt({ busy: true });
    try { const r = await checkSavedChannelAction(id); setSt(r.ok ? { busy: false, ok: true, text: `Работает: ${r.name}` } : { busy: false, ok: false, text: r.error }); }
    catch { setSt({ busy: false, ok: false, text: "Не удалось выполнить проверку" }); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={run} disabled={st.busy} className="btn btn-ghost !px-2.5 !py-1 text-xs">{st.busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}Проверить</button>
      {st.text && <span className={`flex items-center gap-1 text-xs ${st.ok ? "text-good" : "text-bad"}`}>{st.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{st.text}</span>}
    </div>
  );
}
