"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Уведомление об использовании cookie. Мы ставим только необходимые для входа и работы сайта, поэтому согласие не выбирается — достаточно «Понятно». */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem("lt_cookie_ok")) setShow(true); } catch { setShow(true); } }, []);
  if (!show) return null;
  return (
    <div role="region" aria-label="Cookie" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-xs text-ink2 shadow-lg">
      <p className="min-w-[14rem] flex-1">Мы используем только cookie, необходимые для входа и работы сайта. <Link href="/legal/cookies" className="text-accent-ink underline">Подробнее</Link></p>
      <button className="btn" onClick={() => { try { localStorage.setItem("lt_cookie_ok", "1"); } catch { /* без хранилища баннер просто покажется снова */ } setShow(false); }}>Понятно</button>
    </div>
  );
}
