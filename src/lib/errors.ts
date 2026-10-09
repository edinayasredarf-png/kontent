/** Человекочитаемая причина типовых сбоев окружения. Без секретов: только «что не настроено». */
/** Таблицы или колонки, которых ещё нет: код новее схемы БД (забыли применить db/adminer-schema.sql). */
export function isSchemaError(e: unknown): boolean {
  const c = (e as { code?: string })?.code;
  return c === "42703" || c === "42P01";
}

export function diagnose(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const m = String(err?.message ?? e);
  if (/AUTH_SECRET/.test(m)) return "На сервере не задан AUTH_SECRET (Vercel → Settings → Environment Variables, затем Redeploy)";
  if (/DATABASE_URL не задан/.test(m)) return "На сервере не задан DATABASE_URL";
  if (err?.code === "42P01" || err?.code === "42703") return "Схема базы данных устарела: выполните актуальный db/adminer-schema.sql в Adminer (он безопасен для повторного запуска)";
  if (err?.code === "28P01" || err?.code === "28000") return "База отклонила логин/пароль из DATABASE_URL";
  if (err?.code === "3D000") return "В DATABASE_URL указана несуществующая база";
  if (/self[- ]signed|certificate|unable to verify|SSL|TLS/i.test(m)) return "Ошибка TLS при подключении к БД: проверьте DATABASE_SSL_SERVERNAME / DATABASE_SSL_CA_PEM";
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|timeout|Connection terminated/i.test(m)) return "Нет соединения с БД: проверьте хост и порт в DATABASE_URL и разрешён ли доступ с Vercel (список IP в Timeweb)";
  return "Внутренняя ошибка сервера. Подробности — в Runtime Logs проекта на Vercel";
}

/** Технический код и текст ошибки для диагностики. pg не кладёт пароль в сообщение; на всякий случай вычищаем userinfo из URL. */
export function technical(e: unknown): string {
  const err = e as { code?: string; message?: string; errors?: unknown[] };
  const inner = Array.isArray(err?.errors) && err.errors.length ? ` [${err.errors.map((x) => (x as { code?: string }).code).filter(Boolean).join(",")}]` : "";
  return `${err?.code ?? "?"}${inner}: ${String(err?.message ?? e).replace(/\/\/[^@\s/]+@/g, "//***@")}`.slice(0, 220);
}
