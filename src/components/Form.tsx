"use client";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";

type Act = (prev: unknown, f: FormData) => Promise<{ error?: string; ok?: string } | void>;

export function Form({ action, children, submit, className, variant, wide }: { wide?: boolean; action: Act; children: React.ReactNode; submit: string; className?: string; variant?: "ghost" | "danger" }) {
  const [state, run, pending] = useActionState(async (p: unknown, f: FormData) => (await action(p, f)) ?? {}, {} as { error?: string; ok?: string });
  return (
    <form action={run} className={className ?? "space-y-4"}>
      {children}
      {state?.ok && <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{state.ok}</p>}
      {state?.error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      <button className={variant === "ghost" ? "btn btn-ghost !py-1.5" : variant === "danger" ? "btn btn-danger !py-1.5" : wide ? "btn h-11 w-full justify-center" : "btn"} disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" />}{submit}</button>
    </form>
  );
}

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><label className="label">{label}</label>{children}</div>
);
