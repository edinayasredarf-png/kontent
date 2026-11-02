"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { ModalButton } from "./ui/ModalButton";

/** Фильтры календаря: завод, формат, статус. Изменения применяются сразу, без кнопки «Применить». */
export function CalendarFilters({ month, factory, kind, status, view = "calendar", factories, kinds, statuses }: {
  view?: string; month: string; factory: string; kind: string; status: string;
  factories: { value: string; label: string }[]; kinds: { value: string; label: string }[]; statuses: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ factory, kind, status, view });
  useEffect(() => { setV({ factory, kind, status, view }); }, [factory, kind, status, view]);
  const go = (o: Partial<typeof v>) => {
    const n = { ...v, ...o }; setV(n);
    const u = new URLSearchParams({ m: month });
    for (const [k, x] of Object.entries(n)) if (x) u.set(k, x);
    start(() => router.replace(`/app/calendar?${u}`, { scroll: false }));
  };
  const sel = "input";
  return (
    <div className="flex items-center gap-2" aria-busy={pending}>
      <select value={v.view} onChange={(e) => go({ view: e.target.value })} aria-label="Вид контент-плана" className="input !w-auto !rounded-lg !py-2.5">
        <option value="calendar">Вид</option><option value="list">Список</option>
      </select>
      <ModalButton keepForViewer label="Фильтр" title="Фильтр контент-плана" icon={<></>} className="btn btn-ghost !rounded-lg">
      <div className="space-y-5">
      <label className="block space-y-2"><span className="text-sm text-ink2">Завод</span>
      <select value={v.factory} onChange={(e) => go({ factory: e.target.value })} aria-label="Завод" className={sel}><option value="">Все заводы</option>{factories.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <label className="block space-y-2"><span className="text-sm text-ink2">Формат</span><select value={v.kind} onChange={(e) => go({ kind: e.target.value })} aria-label="Формат" className={sel}><option value="">Все форматы</option>{kinds.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <label className="block space-y-2"><span className="text-sm text-ink2">Статус</span><select value={v.status} onChange={(e) => go({ status: e.target.value })} aria-label="Статус" className={sel}><option value="">Все статусы</option>{statuses.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <button type="button" onClick={() => go({ factory: "", kind: "", status: "" })} className="btn btn-ghost">Сбросить фильтры</button>
      <p className="text-xs text-ink3" role="status">{pending ? "Загружаем материалы…" : "Изменения применяются сразу"}</p>
      </div></ModalButton>
      {pending && <Loader2 size={16} className="animate-spin text-accent" aria-label="Загружаем" />}
    </div>
  );
}
