"use client";
import React, { useActionState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";

import { SubmitButton } from "@/components/SubmitButton";
type Res = { text?: string; error?: string; links?: { n: number; title: string; source: string; href: string }[] };

/** Карточка «нажми — получи текст от ИИ»: цена в подписи, ошибка и результат прямо под кнопкой. */
export function AiPanel({ title, hint, button, action }: { title: string; hint: string; button: string; action: (prev: unknown) => Promise<Res | void> }) {
  const [res, run, pending] = useActionState(async (p: unknown) => (await action(p)) ?? {}, {} as Res);
  return (
    <div className="card mb-6 p-4">
      <form action={run} className="flex flex-wrap items-center gap-3">
        <div className="mr-auto"><b className="text-sm">{title}</b><p className="text-xs text-ink2">{hint}</p></div>
        <SubmitButton className="btn btn-ghost" disabled={pending}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{button}</SubmitButton>
      </form>
      {res.error && <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{res.error}</p>}
      {res.text && (
        <div className="mt-3 rounded-xl bg-tile p-4 text-sm leading-relaxed">
          <Formatted text={res.text} refs={res.links} />
          {!!res.links?.length && (
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink2">Посты, на которые опирается сводка ({res.links.length})</summary>
              <ol className="mt-2 space-y-1.5 text-xs">{res.links.map((l) => <li key={l.n} className="flex gap-2"><span className="w-6 shrink-0 text-ink3">{l.n}.</span><Link href={l.href} className="min-w-0 flex-1 hover:text-accent-ink"><span className="line-clamp-2">{l.title}</span><span className="text-ink3">{l.source}</span></Link></li>)}</ol>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

type Ref = { n: number; href: string; title: string };

/** Текст нейросети без разметки в сыром виде: заголовки, жирный, списки; «пост 12» и «посты 1, 7, 20» становятся ссылками на посты в мониторинге. */
export function Formatted({ text, refs }: { text: string; refs?: Ref[] }) {
  const by = new Map((refs ?? []).map((r) => [r.n, r]));
  const inline = (s: string, key: string): React.ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).flatMap((seg, i): React.ReactNode[] => {
    if (/^\*\*[^*]+\*\*$/.test(seg)) return [<b key={`${key}b${i}`} className="font-semibold">{seg.slice(2, -2)}</b>];
    if (!by.size) return [seg];
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of seg.matchAll(/(пост(?:а|ов|ы)?\s+)((?:\d{1,2}(?:\s*(?:[,/–-]|и)\s*))*\d{1,2})/gi)) {
      out.push(seg.slice(last, m.index + m[1].length));
      let pos = 0; const grp = m[2];
      for (const n of grp.matchAll(/\d{1,2}/g)) {
        out.push(grp.slice(pos, n.index));
        const r = by.get(Number(n[0]));
        out.push(r ? <Link key={`${key}l${i}${m.index}${n.index}`} href={r.href} title={r.title} className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[0.85em] font-semibold text-accent-ink hover:shadow-[inset_0_0_0_1.5px_var(--accent)]">{n[0]}</Link> : n[0]);
        pos = n.index + n[0].length;
      }
      last = m.index + m[0].length;
    }
    out.push(seg.slice(last));
    return out;
  });
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((ln, i) => {
        const t = ln.trim();
        if (!t) return <div key={i} className="h-1.5" />;
        const h = t.match(/^#{1,6}\s+(.*)$/);
        if (h) return <h4 key={i} className="mt-3 text-[15px] font-semibold first:mt-0">{inline(h[1], `h${i}`)}</h4>;
        const b = t.match(/^[-*•]\s+(.*)$/);
        if (b) return <p key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" /><span>{inline(b[1], `b${i}`)}</span></p>;
        return <p key={i}>{inline(t, `p${i}`)}</p>;
      })}
    </div>
  );
}
