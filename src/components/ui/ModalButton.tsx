"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "./Modal";

/** Таблетка «+ Добавить …», по нажатию открывает окно с формой (форма приходит с сервера как children). */
export function ModalButton({ label, title, children, className = "pill" }: { label: string; title: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Plus size={16} />{label}</button>
      {open && <Modal title={title} onClose={() => setOpen(false)}>{children}</Modal>}
    </>
  );
}
