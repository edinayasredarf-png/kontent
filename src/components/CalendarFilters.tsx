"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

/** Фильтры календаря: завод, формат, статус. Изменения применяются сразу, без кнопки «Применить». */
export function CalendarFilters({ month, factory, kind, status, factories, kinds, statuses }: {
  month: string; factory: string; kind: string; status: string;
  factories: { value: string; label: string }[]; kinds: { value: string; label: string }[]; statuses: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ factory, kind, status });
  useEffect(() => { setV({ factory, kind, status }); }, [factory, kind, status]);
  const go = (o: Partial<typeof v>) => {
    const n = { ...v, ...o }; setV(n);
    const u = new URLSearchParams({ m: month });
    for (const [k, x] of Object.entries(n)) if (x) u.set(k, x);
    start(() => router.replace(`/app/calendar?${u}`, { scroll: false }));
  };
  const sel = "input !w-auto !py-2";
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <select value={v.factory} onChange={(e) => go({ factory: e.target.value })} aria-label="Завод" className={sel}><option value="">Все заводы</option>{factories.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      <select value={v.kind} onChange={(e) => go({ kind: e.target.value })} aria-label="Формат" className={sel}><option value="">Все форматы</option>{kinds.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      <select value={v.status} onChange={(e) => go({ status: e.target.value })} aria-label="Статус" className={sel}><option value="">Все статусы</option>{statuses.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      {pending && <Loader2 size={16} className="animate-spin text-accent" aria-label="Загружаем" />}
    </div>
  );
}
