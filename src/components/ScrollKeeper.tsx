"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const KEY = "lt_scroll_keep";

/**
 * Запоминает, где пользователь стоял в ленте, когда он отправляет форму создания материала или любую форму в окне материала,
 * и возвращает туда после перезагрузки страницы, чтобы лента не прыгала наверх и нужный пост не терялся.
 */
export function ScrollKeeper() {
  const search = useSearchParams().toString();
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const f = e.target as HTMLElement | null;
      if (f?.closest?.("form[data-keep-scroll], [role=dialog] form")) {
        // у открытого окна страница не прокручивается, поэтому берём позицию, запомненную при его открытии
        const prev = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { y: number } | null; } catch { return null; } })();
        const y = f.closest("[role=dialog]") && prev ? prev.y : window.scrollY;
        try { sessionStorage.setItem(KEY, JSON.stringify({ y, at: Date.now() })); } catch { /* без запоминания */ }
      }
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      const { y, at } = JSON.parse(raw) as { y: number; at: number };
      if (Date.now() - at > 3 * 60_000) { sessionStorage.removeItem(KEY); return; }
      // пока окно открыто, позицию держим на случай следующего действия в нём; после закрытия забываем
      if (!search.includes("draft=")) sessionStorage.removeItem(KEY);
      const go = () => window.scrollTo({ top: y, behavior: "instant" });
      go(); requestAnimationFrame(go); setTimeout(go, 150);
    } catch { /* ок */ }
  }, [search]);
  return null;
}
