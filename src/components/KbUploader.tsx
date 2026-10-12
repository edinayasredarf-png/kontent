"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { KB_KINDS } from "@/lib/kb/kinds";

/** Загрузка документов (.txt, .md, .docx, .html) в базу знаний: текст извлекается на сервере. */
export function KbUploader({ brandId }: { brandId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [kind, setKind] = useState("company"), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMsg(null);
    let n = 0, err = "";
    for (const f of Array.from(files).slice(0, 10)) {
      const fd = new FormData(); fd.set("brandId", brandId); fd.set("kind", kind); fd.set("file", f);
      try {
        const res = await fetch("/api/kb/upload", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { err = `${f.name}: ${j.error || res.status}`; break; }
        n++;
      } catch { err = "Нет связи с сервером"; break; }
    }
    setBusy(false); if (ref.current) ref.current.value = "";
    setMsg(err ? { ok: false, t: (n ? `Загружено: ${n}. ` : "") + err } : { ok: true, t: `Загружено файлов: ${n}. Нажмите «Проанализировать».` });
    router.refresh();
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="input !w-auto">{Object.entries(KB_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input ref={ref} type="file" hidden multiple accept=".txt,.md,.markdown,.csv,.docx,.html,.htm" onChange={(e) => pick(e.target.files)} />
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}Выбрать файлы</button>
      </div>
      <p className="text-xs text-ink2">.txt, .md, .docx, .html до 4 МБ. PDF откройте и вставьте текст в поле выше.</p>
      {msg && <p className={`text-xs ${msg.ok ? "text-ink2" : "text-bad"}`}>{msg.t}</p>}
    </div>
  );
}
