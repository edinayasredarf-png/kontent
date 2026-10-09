"use client";
import { useEffect } from "react";

/**
 * Страница-обработчик токена для SDK Яндекс ID (redirect_uri = /suggest/token). Яндекс отправляет сюда пользователя после согласия,
 * а скрипт передаёт токен обратно на страницу входа и закрывает окно. Этот адрес нужно добавить в Callback URI приложения.
 */
export default function SuggestToken() {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js";
    s.onload = () => { (window as unknown as { YaSendSuggestToken?: () => void }).YaSendSuggestToken?.(); };
    document.head.appendChild(s);
  }, []);
  return <main className="grid min-h-screen place-items-center px-5 text-sm text-ink2">Завершаем вход…</main>;
}
