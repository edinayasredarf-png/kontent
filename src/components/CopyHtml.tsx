"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Копирует готовый HTML письма в буфер: вставляется в редактор почтового сервиса. */
export function CopyHtml({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  return (
    <button type="button" className="btn btn-ghost !py-1.5" onClick={async () => {
      try { const t = await (await fetch(url, { credentials: "same-origin" })).text(); await navigator.clipboard.writeText(t); setState("ok"); } catch { setState("err"); }
      setTimeout(() => setState("idle"), 2200);
    }}>{state === "ok" ? <Check size={14} /> : <Copy size={14} />}{state === "ok" ? "Скопировано" : state === "err" ? "Не вышло" : "Копировать HTML"}</button>
  );
}
