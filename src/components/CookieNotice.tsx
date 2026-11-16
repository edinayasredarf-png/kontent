"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { METRIKA_SCRIPT } from "@/lib/metrika";

type Preferences = { functional: boolean; analytics: boolean };

const REQUIRED_ONLY = { functional: false, analytics: false };
const ACCEPT_ALL = { functional: true, analytics: true };
const COOKIE_NAME = "lt_cookie_preferences";

export function CookieSettingsLink() {
  return <button type="button" className="w-fit text-left opacity-80 transition-opacity hover:opacity-100" onClick={() => window.dispatchEvent(new Event("lt:cookie-settings"))}>Настройки cookie</button>;
}

export function CookieNotice() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(REQUIRED_ONLY);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )lt_cookie_preferences=([01])([01])(?:;|$)/);
    if (match) {
      const saved = { functional: match[1] === "1", analytics: match[2] === "1" };
      setPreferences(saved);
      setDraft(saved);
    } else {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    const showSettings = () => {
      setCustom(true);
      setOpen(true);
    };
    window.addEventListener("lt:cookie-settings", showSettings);
    return () => window.removeEventListener("lt:cookie-settings", showSettings);
  }, []);

  function save(next: Preferences) {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAME}=${Number(next.functional)}${Number(next.analytics)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    if (!next.functional) document.cookie = "lt_theme=; Path=/; Max-Age=0";
    if (preferences?.analytics && !next.analytics) {
      location.reload();
      return;
    }
    setPreferences(next);
    setDraft(next);
    setOpen(false);
    setCustom(false);
  }

  return <>
    {preferences?.analytics && <Script id="yandex-metrika" strategy="afterInteractive">{METRIKA_SCRIPT}</Script>}
    {open && (
      <aside aria-label="Настройки cookie" className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-4 text-sm text-ink shadow-lg sm:bottom-6 sm:right-6">
        <h2 className="font-semibold">Файлы cookie</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink2">
          Необходимые cookie помогают сайту работать. Вы можете разрешить cookie для настроек и аналитики.
        </p>
        {custom && (
          <fieldset className="mt-3 space-y-2 text-xs">
            <legend className="mb-2 font-medium">Категории cookie</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked disabled /> Необходимые</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.functional} onChange={(event) => setDraft({ ...draft, functional: event.target.checked })} /> Функциональные</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.analytics} onChange={(event) => setDraft({ ...draft, analytics: event.target.checked })} /> Аналитические</label>
          </fieldset>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button type="button" className="btn btn-accent rounded-full px-5 text-xs" onClick={() => save(ACCEPT_ALL)}>Принять</button>
          <button type="button" className="py-2 text-xs font-medium text-ink2 transition-colors hover:text-ink hover:underline" onClick={() => save(REQUIRED_ONLY)}>Отклонить</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-ink2">
          <Link href="/legal/cookies" className="transition-colors hover:text-ink hover:underline">Политика cookie</Link>
          {custom ? (
            <button type="button" className="font-medium transition-colors hover:text-ink hover:underline" onClick={() => save(draft)}>Сохранить выбор</button>
          ) : (
            <button type="button" className="transition-colors hover:text-ink hover:underline" onClick={() => setCustom(true)}>Настройки</button>
          )}
        </div>
      </aside>
    )}
  </>;
}
