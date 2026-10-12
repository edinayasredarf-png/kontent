"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pendingStore } from "@/lib/pending-store";

/** Полоса загрузки при переходе по внутренним ссылкам: включается по клику, выключается, когда адрес сменился (или через 20 секунд на всякий случай). */
export function NavProgress() {
  const path = usePathname(), search = useSearchParams().toString();
  const active = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (active.current) { active.current = false; pendingStore.dec(); } if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => { stop(); }, [path, search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      const href = a?.getAttribute("href");
      if (!a || !href || a.target === "_blank" || a.hasAttribute("download") || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return;
      const url = new URL(href, location.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!active.current) { active.current = true; pendingStore.inc(); }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(stop, 20_000);
    };
    // обычные формы-фильтры (GET на адрес страницы) не имеют серверного действия React: включаем полосу по отправке
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      const act = form?.getAttribute("action") ?? "";
      if (!form || !act.startsWith("/") || act.startsWith("/api/")) return;
      if (!active.current) { active.current = true; pendingStore.inc(); }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(stop, 20_000);
    };
    // фаза перехвата: Link сам отменяет стандартное действие клика, и в обычной фазе мы бы видели уже «отменённый» клик
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("submit", onSubmit, true); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
