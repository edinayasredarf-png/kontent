"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { pendingStore } from "@/lib/pending-store";
import { READONLY_HINT, useReadOnly } from "./shell/RoleContext";

/**
 * Кнопка отправки формы с индикатором ожидания: пока действие выполняется, она блокируется, показывает спиннер и включает общую полосу
 * загрузки сверху. Работает внутри любой <form action={…}>; вне формы ведёт себя как обычная кнопка.
 */
export function SubmitButton({ children, disabled, title, allowReadOnly, ...rest }: React.ComponentProps<"button"> & { allowReadOnly?: boolean }) {
  const { pending } = useFormStatus();
  const ro = useReadOnly(), ref = useRef<HTMLButtonElement>(null), [blocked, setBlocked] = useState(false);
  // наблюдателю блокируем кнопки изменяющих форм; поисковые формы (method=get), выход и подобное отмечены allowReadOnly
  useEffect(() => { setBlocked(ro && !allowReadOnly && (ref.current?.form?.getAttribute("method") ?? "").toLowerCase() !== "get"); }, [ro, allowReadOnly]);
  useEffect(() => { if (!pending) return; pendingStore.inc(); return () => pendingStore.dec(); }, [pending]);
  return (
    <button {...rest} ref={ref} title={blocked ? READONLY_HINT : title} disabled={disabled || pending || blocked} data-readonly-blocked={blocked || undefined} aria-busy={pending || undefined} data-pending={pending || undefined}>
      {pending && <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />}
      {children}
    </button>
  );
}
