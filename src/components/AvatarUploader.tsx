"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Avatar } from "./Avatar";
import { shrink } from "./ImagePicker";

/** Фото профиля: загрузить своё или убрать. Файл сначала уменьшается в браузере, на сервере обрезается до квадрата 256×256. */
export function AvatarUploader({ id, v, name, email, source }: { id: string; v: number | null; name: string; email: string; source: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [ver, setVer] = useState(v);
  const [src, setSrc] = useState(source);
  const [busy, setBusy] = useState<"" | "up" | "del">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const upload = async (file: File) => {
    setBusy("up"); setMsg(null);
    try {
      const small = await shrink(file);
      const f = new FormData(); f.set("file", small);
      const r = await fetch("/api/avatar", { method: "POST", body: f });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; v?: number };
      if (!r.ok || !j.ok) throw new Error(j.error || "Не удалось загрузить");
      setVer(j.v ?? Math.floor(Date.now() / 1000)); setSrc("upload"); setMsg({ ok: true, text: "Фото обновлено" }); router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(""); if (input.current) input.current.value = ""; }
  };
  const remove = async () => {
    setBusy("del"); setMsg(null);
    try {
      const r = await fetch("/api/avatar", { method: "DELETE" });
      if (!r.ok) throw new Error("Не удалось удалить");
      setVer(null); setSrc(null); setMsg({ ok: true, text: "Фото удалено" }); router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(""); }
  };
  const from = src === "yandex" ? "Яндекса" : src === "vk" ? "VK" : "";
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar id={id} v={ver} name={name} email={email} className="size-20" text="text-2xl" />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={!!busy} className="btn btn-accent !py-2">{busy === "up" ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{ver ? "Заменить фото" : "Загрузить фото"}</button>
          {ver && <button type="button" onClick={remove} disabled={!!busy} className="btn btn-ghost !py-2" data-confirm="Убрать фото профиля?" data-confirm-ok="Убрать">{busy === "del" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}Убрать</button>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        <p className="text-xs text-ink3">JPG, PNG или WebP. Фото обрежется до квадрата.{from ? ` Сейчас стоит фото из ${from}: оно подтягивается при входе, пока вы не загрузите своё.` : ""}</p>
        {msg && <p className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
