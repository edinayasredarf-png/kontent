"use client";
import { useEffect, useRef, useState } from "react";

/** Какая тема сейчас показана: явный выбор в профиле или системная. */
const isDark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches; };

/**
 * Официальный виджет VK ID (OneTap) с теми же параметрами, что в коде из кабинета VK: режим Callback, источник LOWCODE.
 * Радиус скругления и высота подогнаны под остальные кнопки сайта (rounded-xl, 44 px). Если виджет не загрузился —
 * через несколько секунд показываем запасную ссылку на вход обычным редиректом.
 */
export function VkIdWidget({ appId, next }: { appId: string; next: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState(false);
  const rendered = useRef(false);

  useEffect(() => {
    if (rendered.current || !box.current) return;
    rendered.current = true;
    let alive = true;
    const timer = setTimeout(() => { if (alive && !box.current?.querySelector("iframe, button")) setFallback(true); }, 7000);

    (async () => {
      try {
        const VKID = await import("@vkid/sdk");
        VKID.Config.init({
          app: Number(appId),
          redirectUrl: `${window.location.origin}/api/oauth/vk/callback`,
          responseMode: VKID.ConfigResponseMode.Callback,
          source: VKID.ConfigSource.LOWCODE,
          scope: "",
        });
        const oneTap = new VKID.OneTap();
        const dark = isDark();
        oneTap
          .render({ container: box.current!, showAlternativeLogin: true, scheme: dark ? VKID.Scheme.DARK : VKID.Scheme.LIGHT, styles: { borderRadius: 12, height: 44 } })
          .on(VKID.WidgetEvents.ERROR, (e: unknown) => { console.error("VKID", e); setError("VK ID вернул ошибку. Попробуйте ещё раз"); setFallback(true); })
          .on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, async (payload: { code: string; device_id: string }) => {
            try {
              setError("");
              const tokens = (await VKID.Auth.exchangeCode(payload.code, payload.device_id)) as { access_token?: string };
              if (!tokens?.access_token) throw new Error("no token");
              const res = await fetch("/api/auth/vk-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: tokens.access_token, next }) });
              const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
              if (!res.ok || !j.ok) throw new Error(j.error || "Не удалось войти через VK");
              window.location.assign(j.url || "/app");
            } catch (e) { setError((e as Error).message === "no token" ? "VK не вернул токен. Попробуйте ещё раз" : (e as Error).message); setFallback(true); }
          });
      } catch (e) { console.error("VKID init", e); setFallback(true); }
    })();
    return () => { alive = false; clearTimeout(timer); };
  }, [appId, next]);

  return (
    <div>
      <div ref={box} className="min-h-11 w-full" />
      {error && <p className="mt-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      {fallback && <a href="/api/oauth/vk/start" className="mt-2 flex h-11 items-center justify-center rounded-xl bg-[#0077FF] px-4 text-sm font-medium text-white transition hover:bg-[#006AE6]">Войти через VK ID по ссылке</a>}
    </div>
  );
}
