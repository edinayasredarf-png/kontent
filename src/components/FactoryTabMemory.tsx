"use client";
import { useEffect } from "react";

/** Запоминает открытую вкладку завода: действия форм возвращают на адрес без параметров, и мы открываем ту вкладку, где человек был. */
export function FactoryTabMemory({ tab }: { tab: string }) {
  useEffect(() => { try { document.cookie = `ftab=${tab}; path=/; max-age=31536000; SameSite=Lax`; } catch { /* без cookie */ } }, [tab]);
  return null;
}
