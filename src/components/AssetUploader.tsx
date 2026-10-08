"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

/** Уменьшает картинку в браузере до ~2000 px и перекодирует: файл с телефона в 8 МБ превращается в 300–600 КБ и проходит лимит запроса. */
async function shrink(file: File, kind: string): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file; // пусть сервер объяснит
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const max = kind === "logo" ? 1200 : 2000, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.size < 3.5 * 1024 * 1024) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d")!;
  if (kind !== "logo") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const type = kind === "logo" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.88));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + (kind === "logo" ? ".png" : ".jpg"), { type }) : file;
}

export function AssetUploader({ brandId, kind, label, multiple, disabled }: { brandId: string; kind: "logo" | "product" | "reference"; label: string; multiple?: boolean; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMsg(null);
    const warnings: string[] = []; let okCount = 0, err = "";
    for (const f of Array.from(files).slice(0, 10)) {
      try {
        const small = await shrink(f, kind);
        const fd = new FormData(); fd.set("brandId", brandId); fd.set("kind", kind); fd.set("file", small);
        const res = await fetch("/api/assets", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { err = j.error || `Ошибка ${res.status}`; break; }
        okCount++; if (j.noteError) warnings.push(j.noteError);
      } catch { err = "Нет связи с сервером"; break; }
    }
    setBusy(false);
    if (ref.current) ref.current.value = "";
    setMsg(err ? { ok: false, text: err } : { ok: true, text: `Загружено: ${okCount}${warnings.length ? `. Описание не получено: ${warnings[0]}` : ""}` });
    router.refresh();
  }

  return (
    <div>
      <input ref={ref} type="file" hidden accept="image/png,image/jpeg,image/webp" multiple={multiple} onChange={(e) => onPick(e.target.files)} />
      <button type="button" className="btn btn-ghost" disabled={busy || disabled} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{label}
      </button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-ink2" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
