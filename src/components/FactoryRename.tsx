"use client";
import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { renameFactoryAction } from "@/lib/actions";
import { useReadOnly } from "./shell/RoleContext";

const H = "text-4xl font-semibold leading-8 text-ink max-md:text-[28px]";

/** Название завода с карандашом: нажатие делает сам заголовок редактируемым (без рамки и кнопок), изменения сохраняются при уходе из поля или по Enter, Esc отменяет. */
export function FactoryRename({ id, name }: { id: string; name: string }) {
  const [edit, setEdit] = useState(false), [val, setVal] = useState(name), [shown, setShown] = useState(name), ro = useReadOnly();
  const cancelled = useRef(false);
  async function save() {
    setEdit(false);
    const v = val.trim();
    if (cancelled.current || !v || v === shown) { setVal(shown); cancelled.current = false; return; }
    setShown(v);
    const f = new FormData(); f.set("id", id); f.set("name", v);
    await renameFactoryAction(f);
  }
  return (
    <div className="mr-auto flex min-w-0 items-center gap-2.5">
      {edit ? (
        <span className="inline-grid min-w-[2ch] max-w-full">
          <span aria-hidden className={`${H} invisible col-start-1 row-start-1 whitespace-pre`}>{val || " "}</span>
          <input autoFocus value={val} maxLength={120} aria-label="Название завода" onFocus={(e) => e.currentTarget.select()} onChange={(e) => setVal(e.target.value)} onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); } }}
            className={`${H} col-start-1 row-start-1 w-full min-w-0 border-0 bg-transparent p-0 outline-none`} />
        </span>
      ) : <h1 className={H}>{shown}</h1>}
      {!ro && !edit && <button type="button" onClick={() => { setVal(shown); setEdit(true); }} aria-label="Переименовать завод" title="Переименовать" className="text-ink2 hover:text-ink"><Pencil size={18} /></button>}
    </div>
  );
}
