"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { addKeywordsAction, suggestKeywordsAction } from "@/lib/monitor/actions";
import type { KwSuggestion } from "@/lib/monitor/news";

/** Подбор ключевых слов нейросетью по описанию бренда и продуктов: выбираете нужные и добавляете одним нажатием. */
export function SuggestKeywords({ brands, priceLabel }: { brands: { id: string; name: string }[]; priceLabel: string }) {
  const router = useRouter();
  const [brand, setBrand] = useState(brands[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(""), [ok, setOk] = useState("");
  const [sug, setSug] = useState<KwSuggestion | null>(null);
  const [inc, setInc] = useState<Set<string>>(new Set()), [exc, setExc] = useState<Set<string>>(new Set());

  async function run() {
    setBusy(true); setErr(""); setOk(""); setSug(null);
    const r = await suggestKeywordsAction(brand);
    if (r.ok) { setSug(r.s); setInc(new Set(r.s.include.slice(0, 12).map((x) => x.word))); setExc(new Set(r.s.exclude.slice(0, 4).map((x) => x.word))); } else setErr(r.error);
    setBusy(false);
  }
  async function add() {
    setBusy(true); setErr("");
    for (const [kind, set] of [["include", inc], ["exclude", exc]] as const) {
      if (!set.size) continue;
      const fd = new FormData(); fd.set("words", [...set].join(", ")); fd.set("kind", kind);
      const r = await addKeywordsAction(null, fd);
      if (r && "error" in r && r.error) { setErr(r.error); setBusy(false); return; }
    }
    setOk(`Добавлено слов: ${inc.size + exc.size}. Новости пересчитаны.`); setSug(null); setBusy(false); router.refresh();
  }
  const toggle = (set: Set<string>, w: string, fn: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(w)) n.delete(w); else n.add(w); fn(n); };

  return (
    <section className="card h-fit p-5">
      <b className="mb-1 block text-sm">Ключевые слова с помощью ИИ</b>
      <p className="mb-3 text-xs text-ink2">Нейросеть предложит слова для отбора новостей по описанию вашего бренда и продуктов завода. Цена {priceLabel}.</p>
      {brands.length === 0 ? <p className="text-sm text-ink2">Сначала создайте бренд.</p> : (
        <div className="flex flex-wrap items-center gap-2">
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className="input !w-auto">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <button type="button" onClick={run} disabled={busy} className="btn btn-ghost">{busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}Подобрать слова</button>
        </div>
      )}
      {err && <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}
      {ok && <p className="mt-3 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{ok}</p>}
      {sug && (
        <div className="mt-4 space-y-4">
          <div><div className="label">Искать (поднимать наверх)</div>
            <div className="space-y-1">{sug.include.map((x) => <label key={x.word} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={inc.has(x.word)} onChange={() => toggle(inc, x.word, setInc)} className="mt-1" /><span><b>{x.word}</b>{x.why && <span className="text-ink3"> — {x.why}</span>}</span></label>)}</div></div>
          {sug.exclude.length > 0 && <div><div className="label">Исключать (резать мусор)</div>
            <div className="space-y-1">{sug.exclude.map((x) => <label key={x.word} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={exc.has(x.word)} onChange={() => toggle(exc, x.word, setExc)} className="mt-1" /><span><b>{x.word}</b>{x.why && <span className="text-ink3"> — {x.why}</span>}</span></label>)}</div></div>}
          <button type="button" onClick={add} disabled={busy || (!inc.size && !exc.size)} className="btn">Добавить выбранные ({inc.size + exc.size})</button>
        </div>
      )}
    </section>
  );
}
