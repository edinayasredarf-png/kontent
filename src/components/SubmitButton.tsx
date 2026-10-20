"use client";
import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { pendingStore } from "@/lib/pending-store";

/**
 * Кнопка отправки формы с индикатором ожидания: пока действие выполняется, она блокируется, показывает спиннер и включает общую полосу
 * загрузки сверху. Работает внутри любой <form action={…}>; вне формы ведёт себя как обычная кнопка.
 */
export function SubmitButton({ children, disabled, ...rest }: React.ComponentProps<"button">) {
  const { pending } = useFormStatus();
  useEffect(() => { if (!pending) return; pendingStore.inc(); return () => pendingStore.dec(); }, [pending]);
  return (
    <button {...rest} disabled={disabled || pending} aria-busy={pending || undefined} data-pending={pending || undefined}>
      {pending && <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />}
      {children}
    </button>
  );
}
