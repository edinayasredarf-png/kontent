"use client";
import { useEffect, useState } from "react";
import { Loader2, Newspaper, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { searchNewsAction, type NewsHit } from "@/lib/text-actions";

/** Выбор новости из ленты мониторинга: заголовок и текст уходят в поле идеи, а материал пишется по ним. */
export function NewsPicker({ onPick }: { onPick: (n: NewsHit) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<NewsHit[] | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setBusy(true); setErr("");
    const t = setTimeout(async () => {
      const r = await searchNewsAction(q).catch(() => null);
      setBusy(false);
      if (r?.ok) setItems(r.items); else setErr(r && !r.ok ? r.error : "Не удалось загрузить новости");
    }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [open, q]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="chip chip-toggle cursor-pointer !px-3 !py-1.5 text-xs"><Newspaper size={13} className="mr-1" />Найти в новостях</button>
      {open && (
        <Modal title="Новость для материала" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Слово из заголовка или текста новости" className="input !pl-9" /></div>
            {busy && <p className="flex items-center gap-2 text-xs text-ink2"><Loader2 size={13} className="animate-spin" />Ищем…</p>}
            {err && <p className="text-xs text-bad">{err}</p>}
            {items && !items.length && !busy && <p className="text-sm text-ink2">Ничего не найдено. Лента наполняется в разделе «Новости»: добавьте источники, и новости появятся здесь.</p>}
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {items?.map((n) => (
                <button key={n.id} type="button" onClick={() => { onPick(n); setOpen(false); }} className="block w-full rounded-2xl bg-tile p-3 text-left hover:bg-surface">
                  <span className="block text-sm font-semibold">{n.title}</span>
                  <span className="mt-0.5 block text-xs text-ink3">{n.source}{n.at ? ` · ${n.at}` : ""}</span>
                  {n.body && <span className="mt-1 line-clamp-2 block text-xs text-ink2">{n.body}</span>}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
