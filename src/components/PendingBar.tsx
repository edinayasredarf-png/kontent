"use client";
import { useSyncExternalStore } from "react";
import { pendingStore } from "@/lib/pending-store";

/** Тонкая полоса сверху, пока выполняется действие. */
export function PendingBar() {
  const n = useSyncExternalStore(pendingStore.subscribe, pendingStore.get, () => 0);
  if (n === 0) return null;
  return <div role="progressbar" aria-label="Выполняется действие" className="lt-bar fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-transparent" />;
}
