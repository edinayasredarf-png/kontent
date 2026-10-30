"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Modal } from "./Modal";

export interface SettingItem { label: string; value: string; modal: string; /** вместо таблетки показывается свой элемент (например, тумблер) */ control?: React.ReactNode }
export interface SettingModal { title: string; wide?: boolean; node: React.ReactNode }

/**
 * Список настроек строками: слева название, справа текущее значение в таблетке со стрелкой. Нажатие открывает окно со всеми полями группы.
 * После сохранения (страница перерисовалась с новым stamp) окно закрывается само.
 */
export function SettingsList({ items, modals, stamp }: { items: SettingItem[]; modals: Record<string, SettingModal>; stamp: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const sent = useRef(false), first = useRef(stamp);
  useEffect(() => { if (stamp !== first.current && sent.current) { sent.current = false; setOpen(null); } first.current = stamp; }, [stamp]);
  const m = open ? modals[open] : null;
  return (
    <>
      <div className="max-w-[749px] divide-y divide-[var(--tile)]">
        {items.map((it) => it.control ? (
          <div key={it.label} className="flex w-full items-center justify-between gap-4 py-4"><span className="text-base font-medium">{it.label}</span>{it.control}</div>
        ) : (
          <button key={it.label} type="button" onClick={() => { sent.current = false; setOpen(it.modal); }} className="flex w-full items-center justify-between gap-4 py-4 text-left transition hover:opacity-80">
            <span className="text-base font-medium">{it.label}</span>
            <span className="inline-flex max-w-[55%] items-center gap-2 rounded-full bg-tile px-4 py-1.5 text-sm"><span className="truncate">{it.value}</span><ChevronDown size={14} className="shrink-0 text-ink2" /></span>
          </button>
        ))}
      </div>
      {m && <Modal title={m.title} wide={m.wide} onClose={() => setOpen(null)}><div onSubmit={() => { sent.current = true; }}>{m.node}</div></Modal>}
    </>
  );
}
