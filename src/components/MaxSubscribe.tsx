"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { maxSubscribeAction } from "@/lib/max-actions";

/** Подключение вебхука бота MAX: после задания MAX_BOT_TOKEN, MAX_WEBHOOK_SECRET и APP_URL. */
export function MaxSubscribe() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true); setRes(null);
    const r = await maxSubscribeAction().catch(() => null);
    setBusy(false);
    setRes(r?.ok ? { ok: true, text: `Вебхук подключён: ${r.url}` } : { ok: false, text: r ? r.error : "Не удалось выполнить" });
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} disabled={busy} className="btn btn-ghost !py-1.5 text-xs">{busy && <Loader2 size={13} className="animate-spin" />}Подключить вебхук бота MAX</button>
      {res && <span className={`text-xs ${res.ok ? "text-good" : "text-bad"}`}>{res.text}</span>}
    </div>
  );
}
