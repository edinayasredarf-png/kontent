"use client";
import { useEffect, useRef, useState } from "react";

/** Какая тема сейчас показана: явный выбор в профиле или системная. */
const isDark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches; };
const sameOrigin = (a: string, b: string) => { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } };

/** Расшифровка текстов ошибок SDK VK ID на понятный язык. Закрытие окна пользователем — не поломка. */
function explain(text: string): { msg: string; soft: boolean } {
  if (/Cannot create new tab/i.test(text)) return { msg: "Браузер заблокировал окно входа VK. Разрешите всплывающие окна для этого сайта и нажмите кнопку ещё раз.", soft: false };
  if (/New tab has been closed/i.test(text)) return { msg: "Окно входа было закрыто. Нажмите кнопку VK ещё раз, чтобы повторить.", soft: true };
  if (/state does not match/i.test(text)) return { msg: "Сессия входа устарела. Нажмите кнопку VK ещё раз.", soft: true };
  if (/Authorization failed/i.test(text)) return { msg: "VK отклонил вход (возможно, вы отказали в доступе).", soft: true };
  return { msg: `VK ID вернул ошибку: ${text || "без описания"}`, soft: false };
}

/**
 * Официальный виджет VK ID (OneTap) с параметрами из кода кабинета VK: режим Callback, источник LOWCODE.
 * Скругление и высота подогнаны под остальные кнопки сайта. Любой сбой показывает причину, а не прячется;
 * запасная ссылка (вход редиректом) появляется только после настоящей поломки.
 */
export function VkIdWidget({ appId, next, canonical }: { appId: string; next: string; canonical?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<{ msg: string; detail?: string } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [wrongHost, setWrongHost] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (canonical && !sameOrigin(canonical, window.location.origin)) { setWrongHost(true); return; }
    if (started.current || !box.current) return;
    started.current = true;
    let alive = true;
    // iframe кнопки появляется почти сразу; если за 10 секунд его нет — виджет не загрузился
    const timer = setTimeout(() => { if (alive && !box.current?.querySelector("iframe, button")) { setError({ msg: "Виджет VK ID не загрузился за 10 секунд. Проверьте, что сайт открыт по основному адресу и не блокируется расширениями (блокировщики рекламы часто режут id.vk.ru)." }); setFallback(true); } }, 10_000);

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
        oneTap
          .render({ container: box.current!, showAlternativeLogin: true, scheme: isDark() ? VKID.Scheme.DARK : VKID.Scheme.LIGHT, styles: { borderRadius: 12, height: 44 } })
          .on(VKID.WidgetEvents.ERROR, (e: { code?: number; text?: string }) => {
            console.error("VKID widget error", e);
            // код 2 — ошибка в процессе входа (закрыли окно, отказ, блокировка окна); 0/1 — виджет не загрузился или сбой VK
            if (e?.code === 2) { const x = explain(e.text ?? ""); setError({ msg: x.msg, detail: `код ${e.code}: ${e.text}` }); if (!x.soft) setFallback(true); }
            else { setError({ msg: "Виджет VK ID не смог загрузиться. Обычно это значит, что адрес сайта не добавлен в приложение VK ID или заблокирован расширением браузера.", detail: `код ${e?.code ?? "?"}${e?.text ? `: ${e.text}` : ""}` }); setFallback(true); }
          })
          .on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, async (payload: { code: string; device_id: string }) => {
            try {
              setError(null);
              const tokens = (await VKID.Auth.exchangeCode(payload.code, payload.device_id)) as { access_token?: string };
              if (!tokens?.access_token) throw new Error("VK не вернул токен");
              const res = await fetch("/api/auth/vk-id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: tokens.access_token, next }) });
              const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string; detail?: string };
              if (!res.ok || !j.ok) { setError({ msg: j.error || "Не удалось войти через VK", detail: j.detail ? `${res.status}: ${j.detail}` : String(res.status) }); setFallback(true); return; }
              window.location.assign(j.url || "/app");
            } catch (e) {
              console.error("VKID exchange", e);
              setError({ msg: "VK подтвердил вход, но обмен кода не удался. Чаще всего так бывает, когда домен сайта не указан как «базовый» в приложении VK ID.", detail: (e as Error).message });
              setFallback(true);
            }
          });
      } catch (e) {
        console.error("VKID init", e);
        setError({ msg: "Не удалось запустить виджет VK ID.", detail: (e as Error).message }); setFallback(true);
      }
    })();
    return () => { alive = false; clearTimeout(timer); };
  }, [appId, next, canonical]);

  if (wrongHost) {
    return (
      <p className="rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
        Вход через VK работает только на основном адресе сайта. <a className="underline" href={`${canonical}/login`}>Открыть {canonical?.replace(/^https?:\/\//, "")}</a>
      </p>
    );
  }
  return (
    <div>
      <div ref={box} className="min-h-11 w-full" />
      {error && (
        <div className="mt-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {error.msg}
          {error.detail && <div className="mt-1 break-words text-xs opacity-80">Подробности: {error.detail}</div>}
        </div>
      )}
      {fallback && <a href="/api/oauth/vk/start" className="mt-2 flex h-11 items-center justify-center rounded-xl bg-[#0077FF] px-4 text-sm font-medium text-white transition hover:bg-[#006AE6]">Войти через VK ID по ссылке</a>}
    </div>
  );
}
