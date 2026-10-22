"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const KEY = "lt_scroll_keep";
interface Rec { path: string; y: number; at: number }
const load = (): Rec | null => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Rec | null; } catch { return null; } };

/**
 * Страница не прыгает наверх после действий. Когда человек отправляет форму, запоминается, где он стоял; если после действия он остался
 * на той же странице (обновление данных, возврат с окном материала, закрытие окна), позиция возвращается. Переход на другую страницу
 * начинается сверху, как обычно. Пока открыто окно материала (draft в адресе), позиция держится на случай следующего действия в нём.
 */
export function ScrollKeeper() {
  const path = usePathname(), search = useSearchParams().toString();
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const f = e.target as HTMLElement | null;
      if (!(f instanceof HTMLFormElement) || f.method === "get" || f.hasAttribute("data-no-scroll-keep")) return;
      // у открытого окна страница не прокручивается, поэтому берём позицию, запомненную при его открытии
      const prev = load();
      const y = f.closest("[role=dialog]") && prev && prev.path === location.pathname ? prev.y : window.scrollY;
      try { sessionStorage.setItem(KEY, JSON.stringify({ path: location.pathname, y, at: Date.now() })); } catch { /* без запоминания */ }
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
  useEffect(() => {
    const r = load();
    if (!r) return;
    const modal = search.includes("draft=") || search.includes("item=");
    if (Date.now() - r.at > (modal ? 3 * 60_000 : 15_000) || r.path !== path) { if (r.path !== path || !modal) try { sessionStorage.removeItem(KEY); } catch { /* ок */ } return; }
    if (!modal) try { sessionStorage.removeItem(KEY); } catch { /* ок */ }
    // в CSS включена плавная прокрутка, а возврат должен быть мгновенным
    const go = () => window.scrollTo({ top: r.y, behavior: "instant" });
    go(); requestAnimationFrame(go); setTimeout(go, 150);
  }, [path, search]);
  return null;
}
