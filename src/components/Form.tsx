"use client";
import { useActionState, useEffect, useRef } from "react";
import { pendingStore } from "@/lib/pending-store";
import { Loader2 } from "lucide-react";

type Act = (prev: unknown, f: FormData) => Promise<{ error?: string; ok?: string } | void>;

export function Form({ action, children, submit, className, variant, wide }: { wide?: boolean; action: Act; children: React.ReactNode; submit: string; className?: string; variant?: "ghost" | "danger" }) {
  const form = useRef<HTMLFormElement>(null), sent = useRef<FormData | null>(null);
  const [state, run, pending] = useActionState(async (p: unknown, f: FormData) => { sent.current = f; const r = (await action(p, f)) ?? {}; return { ...r, at: Date.now() }; }, {} as { error?: string; ok?: string; at?: number });
  // React очищает форму после действия; при ошибке возвращаем введённое, чтобы не набирать заново
  useEffect(() => {
    const f = form.current, v = sent.current;
    if (!state?.error || !f || !v) return;
    for (const el of Array.from(f.elements) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[]) {
      if (!el.name || el.type === "hidden" || el.type === "password" || el.type === "file" || el.type === "submit" || el.type === "button") continue;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) { el.checked = v.getAll(el.name).includes(el.value); continue; }
      const val = v.get(el.name); if (typeof val === "string") el.value = val;
    }
  }, [state]);
  useEffect(() => { if (!pending) return; pendingStore.inc(); return () => pendingStore.dec(); }, [pending]);
  return (
    <form ref={form} action={run} className={className ?? "space-y-4"}>
      {children}
      {state?.ok && <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{state.ok}</p>}
      {state?.error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      {submit && <button className={variant === "ghost" ? "btn btn-ghost !py-1.5" : variant === "danger" ? "btn btn-danger !py-1.5" : wide ? "btn h-11 w-full justify-center" : "btn"} disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}{submit}</button>}
    </form>
  );
}

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><label className="label">{label}</label>{children}</div>
);
