"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

/** Панель плана завода в одну строку: вид, формат, статус. Изменения применяются сразу, без кнопки «Применить». */
export function PlanToolbar({ factoryId, view, kind, status, month, kinds, statuses, children }: {
  factoryId: string; view: string; kind: string; status: string; month: string;
  kinds: { value: string; label: string }[]; statuses: { value: string; label: string }[]; children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // выбранное значение показываем сразу, не дожидаясь ответа сервера
  const [sv, setSv] = useState({ view, kind, status });
  useEffect(() => { setSv({ view, kind, status }); }, [view, kind, status]);
  const go = (o: { view?: string; kind?: string; status?: string }) => {
    const v = { ...sv, ...o }; setSv(v);
    const u = new URLSearchParams({ tab: "plan", view: v.view });
    if (v.kind) u.set("kind", v.kind);
    if (v.status) u.set("status", v.status);
    if (v.view === "calendar") u.set("m", month);
    start(() => router.replace(`/app/factories/${factoryId}?${u}`, { scroll: false }));
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select value={sv.view} onChange={(e) => go({ view: e.target.value })} aria-label="Вид" className="input !w-auto !py-2">
        <option value="list">Вид: список</option>
        <option value="calendar">Вид: календарь</option>
      </select>
      <select value={sv.kind} onChange={(e) => go({ kind: e.target.value })} aria-label="Формат" className="input !w-auto !py-2">
        <option value="">Все форматы</option>
        {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      <select value={sv.status} onChange={(e) => go({ status: e.target.value })} aria-label="Статус" className="input !w-auto !py-2">
        <option value="">Все статусы</option>
        {statuses.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      {pending && <Loader2 size={16} className="animate-spin text-accent" aria-label="Загружаем" />}
      <div className="ml-auto">{children}</div>
    </div>
  );
}
