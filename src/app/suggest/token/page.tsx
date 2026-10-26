"use client";
import { useEffect, useState } from "react";

/**
 * Страница-обработчик токена Яндекс ID (redirect_uri = /suggest/token; адрес должен быть в Callback URI приложения).
 * Яндекс возвращает токен в адресе (#access_token=…). Входим здесь же, не полагаясь на передачу токена окну-родителю:
 * браузеры и политики Яндекса нередко обрывают связь с окном (opener), тогда вход «зависал». После входа окно закрывается,
 * а родитель (страница входа) переходит в кабинет; если родителя нет, переходим в кабинет сами.
 */
export default function SuggestToken() {
  const [msg, setMsg] = useState("Завершаем вход…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("access_token");
    if (!token) { setMsg("Яндекс не вернул токен. Вернитесь на страницу входа и попробуйте ещё раз."); setFailed(true); return; }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25_000);
    (async () => {
      try {
        let next = "/app";
        try { next = sessionStorage.getItem("ya_next") || localStorage.getItem("ya_next") || next; } catch { /* нет доступа к хранилищу */ }
        setMsg("Проверяем аккаунт Яндекса…");
        const res = await fetch("/api/auth/yandex-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, next }), signal: ac.signal });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string; detail?: string };
        if (!res.ok || !j.ok) throw new Error([j.error || "Не удалось войти через Яндекс", j.detail].filter(Boolean).join(": "));
        const url = j.url || "/app";
        setMsg("Готово, открываем кабинет…");
        // страница входа слушает это событие, даже если связь с окном (opener) оборвана
        try { localStorage.setItem("ya_login_done", JSON.stringify({ url, at: Date.now() })); } catch { /* нет хранилища */ }
        try {
          if (window.opener && !window.opener.closed) { window.opener.location.assign(url); window.close(); }
        } catch { /* связь с родителем потеряна: идём сами */ }
        window.location.replace(url);
      } catch (e) {
        setMsg((e as Error).name === "AbortError" ? "Сервер слишком долго проверял аккаунт Яндекса. Попробуйте ещё раз или войдите по паролю." : (e as Error).message || "Не удалось войти через Яндекс");
        setFailed(true);
      } finally { clearTimeout(timer); }
    })();
    return () => { clearTimeout(timer); ac.abort(); };
  }, []);

  return (
    <main className="grid min-h-screen place-items-center px-5 text-center text-sm text-ink2">
      <div className="max-w-sm">{msg}{failed && <div className="mt-4"><a href="/login" className="link-btn">На страницу входа</a></div>}</div>
    </main>
  );
}
