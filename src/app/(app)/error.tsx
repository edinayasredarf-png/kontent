"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/** Любая необработанная ошибка в кабинете: понятный экран вместо «Application error». Детали ошибки в проде скрыты — их код (digest) ищите в логах Vercel. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-warn-soft text-warn"><AlertTriangle size={22} /></div>
      <h1 className="mb-2 text-xl font-semibold">Не удалось открыть страницу</h1>
      <p className="mb-5 text-sm text-ink2">Попробуйте ещё раз. Если ошибка повторяется, проверьте <a className="text-accent-ink underline" href="/api/health">состояние системы</a>: частая причина — не применена последняя миграция базы данных.</p>
      <button onClick={reset} className="btn">Повторить</button>
      {error.digest && <p className="mt-4 text-xs text-ink3">Код ошибки: {error.digest}</p>}
    </div>
  );
}
