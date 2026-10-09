"use client";
import { useActionState } from "react";
import { Loader2, Sparkles } from "lucide-react";

type Res = { text?: string; error?: string };

/** Карточка «нажми — получи текст от ИИ»: цена в подписи, ошибка и результат прямо под кнопкой. */
export function AiPanel({ title, hint, button, action }: { title: string; hint: string; button: string; action: (prev: unknown) => Promise<Res | void> }) {
  const [res, run, pending] = useActionState(async (p: unknown) => (await action(p)) ?? {}, {} as Res);
  return (
    <div className="card mb-6 p-4">
      <form action={run} className="flex flex-wrap items-center gap-3">
        <div className="mr-auto"><b className="text-sm">{title}</b><p className="text-xs text-ink2">{hint}</p></div>
        <button className="btn btn-ghost" disabled={pending}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{button}</button>
      </form>
      {res.error && <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{res.error}</p>}
      {res.text && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-tile p-4 text-sm leading-relaxed">{res.text}</div>}
    </div>
  );
}
