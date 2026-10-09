import { DatabaseZap } from "lucide-react";

export const dynamic = "force-static";
export const metadata = { title: "Нужно обновить базу данных" };

/** Страница без обращений к БД: открывается, даже когда схема базы отстаёт от кода. */
export default function UpdateRequired() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-warn-soft text-warn"><DatabaseZap size={22} /></div>
      <h1 className="mb-2 text-2xl font-semibold">Нужно обновить базу данных</h1>
      <p className="mb-5 text-sm text-ink2">Приложение обновилось, а структура базы данных ещё нет. Данные целы — достаточно один раз применить обновление.</p>
      <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm">
        <li>Откройте Adminer и выберите базу проекта.</li>
        <li>Перейдите в «SQL-запрос» (SQL command).</li>
        <li>Вставьте всё содержимое файла <code className="rounded bg-tile px-1.5 py-0.5 text-xs">db/adminer-schema.sql</code> из репозитория и нажмите «Выполнить».</li>
        <li>Обновите эту страницу.</li>
      </ol>
      <p className="text-xs text-ink3">Файл безопасно запускать повторно: уже созданное он пропускает. Проверить состояние можно на странице /api/health.</p>
    </main>
  );
}
