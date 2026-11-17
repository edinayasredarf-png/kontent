"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteBrandAction } from "@/lib/actions";
import { deleteKnowledgeAction } from "@/lib/kb/actions";
import { Form } from "./Form";
import { Modal } from "./ui/Modal";

export function DeleteBrand({ id, name, knowledge = false }: { id: string; name: string; knowledge?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = knowledge ? "Удалить базу знаний" : "Удалить бренд";
  return (
    <div className="shrink-0">
      <button type="button" className="grid size-10 place-items-center rounded-full bg-bad-soft text-bad transition hover:opacity-80" title={label} aria-label={label} onClick={() => setOpen(true)}>
        <Trash2 size={15} />
      </button>
      {open && <Modal title={`${label} «${name}»?`} onClose={() => setOpen(false)}>
        <Form action={knowledge ? deleteKnowledgeAction : deleteBrandAction} submit="Удалить всё" variant="danger" className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="confirm_delete" value="yes" />
          {knowledge ? <p>Будут удалены документы, профиль и стиль письма из этой базы знаний.</p> : <p>Вместе с брендом будут удалены его заводы, материалы, каналы, автоленты, группы конкурентов, брендбук, база знаний, сохранённые идеи, пресеты и внешние посты из аналитики.</p>}
          <p className="text-sm text-bad">Действие нельзя отменить.</p>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Отмена</button>
        </Form>
      </Modal>}
    </div>
  );
}
