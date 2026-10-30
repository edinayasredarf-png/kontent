"use client";
import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { renameFactoryAction } from "@/lib/actions";
import { useReadOnly } from "./shell/RoleContext";

/** Название завода с карандашом: нажатие превращает заголовок в поле, «галочка» или Enter сохраняет. */
export function FactoryRename({ id, name }: { id: string; name: string }) {
  const [edit, setEdit] = useState(false), ro = useReadOnly();
  if (edit) return (
    <form action={async (f) => { await renameFactoryAction(f); setEdit(false); }} className="mr-auto flex min-w-0 items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="name" defaultValue={name} autoFocus required maxLength={120} onKeyDown={(e) => { if (e.key === "Escape") setEdit(false); }} className="input !w-auto min-w-0 !text-2xl font-semibold" />
      <button className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white" aria-label="Сохранить название"><Check size={16} /></button>
    </form>
  );
  return (
    <div className="mr-auto flex min-w-0 items-center gap-2.5">
      <h1 className="text-4xl font-semibold leading-8 text-ink max-md:text-[28px]">{name}</h1>
      {!ro && <button type="button" onClick={() => setEdit(true)} aria-label="Переименовать завод" title="Переименовать" className="text-ink2 hover:text-ink"><Pencil size={18} /></button>}
    </div>
  );
}
