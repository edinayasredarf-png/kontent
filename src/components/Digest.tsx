"use client";
import { useActionState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { digestAction } from "@/lib/monitor/actions";

export function Digest({ price }: { price: string }) {
  const [res, run, pending] = useActionState(async (p: unknown) => (await digestAction(p)) ?? {}, {} as { text?: string; error?: string });
  return (
    <div className="card mb-6 p-4">
      <form action={run} className="flex flex-wrap items-center gap-3">
        <div className="mr-auto"><b className="text-sm">Анализ ленты</b><p className="text-xs text-ink2">Главные темы недели и идеи для материалов · {price}</p></div>
        <button className="btn btn-ghost" disabled={pending}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}Что в тренде</button>
      </form>
      {res.error && <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{res.error}</p>}
      {res.text && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-tile p-4 text-sm leading-relaxed">{res.text}</div>}
    </div>
  );
}
