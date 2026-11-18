"use client";
import { useState } from "react";
import { subscribeTelegramBot } from "@/lib/channel-connect-actions";
export function TelegramSubscribe() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div className="mt-3 space-y-2"><button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={async () => { setBusy(true); try { const r = await subscribeTelegramBot(); setMessage(r.ok ? "Вебхук Telegram подключён" : r.error); } catch { setMessage("Не удалось подключить вебхук Telegram"); } finally { setBusy(false); } }}>{busy ? "Подключаем…" : "Подключить вебхук бота Telegram"}</button>{message && <p role="status" className="text-xs text-ink2">{message}</p>}</div>;
}
