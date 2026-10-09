"use client";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { YaAuthSuggest?: { init: (q: Record<string, string>, origin: string, s?: Record<string, unknown>) => Promise<{ status?: string; code?: string; handler: () => Promise<{ access_token?: string }> }> } }
}

const SDK = "https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js";

/**
 * Официальная кнопка Яндекс ID (SDK YaAuthSuggest из документации Яндекса): чёрная «main» с фирменным знаком.
 * Скругление и высота подогнаны под остальные кнопки сайта. Если SDK не загрузился — запасная ссылка на вход редиректом.
 */
export function YandexIdWidget({ clientId, next }: { clientId: string; next: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !box.current) return;
    started.current = true;
    let alive = true;
    const timer = setTimeout(() => { if (alive && !box.current?.querySelector("iframe, button")) setFallback(true); }, 7000);

    const run = async () => {
      try {
        const origin = window.location.origin;
        const r = await window.YaAuthSuggest!.init(
          { client_id: clientId, response_type: "token", redirect_uri: `${origin}/suggest/token` }, origin,
          { view: "button", parentId: "ya-id-button", buttonView: "main", buttonTheme: document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light", buttonSize: "m", buttonBorderRadius: 12, buttonIcon: "ya" },
        );
        if (r.status === "error") { setFallback(true); return; }
        const data = await r.handler();
        if (!data?.access_token) throw new Error("Яндекс не вернул токен");
        const res = await fetch("/api/auth/yandex-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: data.access_token, next }) });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (!res.ok || !j.ok) throw new Error(j.error || "Не удалось войти через Яндекс");
        window.location.assign(j.url || "/app");
      } catch (e) {
        // закрытие окна согласия пользователем — не ошибка, показываем только реальные сбои
        const msg = typeof e === "object" && e && "message" in e ? String((e as Error).message) : "";
        if (msg) setError(msg);
        setFallback(true);
      }
    };

    if (window.YaAuthSuggest) void run();
    else {
      const s = document.createElement("script");
      s.src = SDK; s.async = true; s.onload = () => void run(); s.onerror = () => setFallback(true);
      document.head.appendChild(s);
    }
    return () => { alive = false; clearTimeout(timer); };
  }, [clientId, next]);

  return (
    <div>
      <div id="ya-id-button" ref={box} className="min-h-11 w-full" />
      {error && <p className="mt-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      {fallback && <a href="/api/oauth/yandex/start" className="mt-2 flex h-11 items-center justify-center rounded-xl bg-black px-4 text-sm font-medium text-white transition hover:bg-[#1c1c1c]">Войти через Яндекс ID по ссылке</a>}
    </div>
  );
}
