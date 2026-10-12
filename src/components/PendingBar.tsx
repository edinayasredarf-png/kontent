"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { pendingStore } from "@/lib/pending-store";

/** Тонкая полоса сверху и подсказка внизу, пока выполняется действие. Подсказка появляется, если ждать дольше двух секунд. */
export function PendingBar() {
  const n = useSyncExternalStore(pendingStore.subscribe, pendingStore.get, () => 0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (n === 0) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 2000);
    return () => clearTimeout(t);
  }, [n]);
  if (n === 0) return null;
  return (
    <>
      <div role="progressbar" aria-label="Выполняется действие" className="lt-bar fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-transparent" />
      {slow && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm shadow-lg">
          <span className="mr-2 inline-block size-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent align-[-2px]" />
          Работаем… Генерация текста или картинки может занять до минуты.
        </div>
      )}
    </>
  );
}
