"use client";
import { useEffect, useState } from "react";

type Sdk = { YaSendSuggestToken?: (origin: string, extra?: Record<string, unknown>) => void };

/**
 * Страница-обработчик токена для SDK Яндекс ID (redirect_uri = /suggest/token). Адрес должен быть в Callback URI приложения.
 * Два случая: окно открыто кнопкой (есть opener) — токен возвращается на страницу входа через SDK, окно закрывается;
 * страница открыта сама по себе (без окна-родителя, например на телефоне или после блокировки всплывающих окон) —
 * входим здесь же: берём токен из адреса и отправляем на сервер.
 */
export default function SuggestToken() {
  const [msg, setMsg] = useState("Завершаем вход…");

  useEffect(() => {
    const origin = window.location.origin;
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("access_token");

    if (window.opener && !window.opener.closed) {
      const s = document.createElement("script");
      s.src = "https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js";
      s.onload = () => { (window as unknown as Sdk).YaSendSuggestToken?.(origin, { flag: true }); };
      s.onerror = () => setMsg("Не удалось загрузить вход Яндекса. Закройте окно и попробуйте ещё раз.");
      document.head.appendChild(s);
      return;
    }

    if (!token) { setMsg("Яндекс не вернул токен. Вернитесь на страницу входа и попробуйте ещё раз."); return; }
    (async () => {
      try {
        let next = "/app";
        try { next = sessionStorage.getItem("ya_next") || next; } catch { /* нет доступа к хранилищу */ }
        const res = await fetch("/api/auth/yandex-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, next }) });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (!res.ok || !j.ok) throw new Error(j.error || "Не удалось войти через Яндекс");
        window.location.replace(j.url || "/app");
      } catch (e) { setMsg((e as Error).message || "Не удалось войти через Яндекс"); }
    })();
  }, []);

  return <main className="grid min-h-screen place-items-center px-5 text-center text-sm text-ink2"><div>{msg}{msg.startsWith("Завершаем") ? null : <div className="mt-3"><a href="/login" className="link-btn">На страницу входа</a></div>}</div></main>;
}
