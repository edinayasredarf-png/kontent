"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "./Modal";
import { useReadOnly } from "../shell/RoleContext";

/** Таблетка «+ Добавить …», по нажатию открывает окно с формой (форма приходит с сервера как children). */
export function ModalButton({ label, title, children, className = "pill", stamp, icon, keepForViewer }: { keepForViewer?: boolean; label: string; title: string; children: React.ReactNode; className?: string; stamp?: number; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(false), ro = useReadOnly();
  // если передан stamp, окно закрывается после отправки формы, когда страница перерисовалась (stamp сменился)
  const sent = useRef(false), first = useRef(stamp);
  useEffect(() => { if (stamp !== undefined && stamp !== first.current && sent.current) { sent.current = false; setOpen(false); } first.current = stamp; }, [stamp]);
  if (ro && !keepForViewer) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{icon ?? <Plus size={16} />}{label}</button>
      {open && <Modal title={title} onClose={() => setOpen(false)}>{stamp !== undefined ? <div onSubmit={() => { sent.current = true; }}>{children}</div> : children}</Modal>}
    </>
  );
}
