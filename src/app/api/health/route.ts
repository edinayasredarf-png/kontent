import { NextResponse } from "next/server";
import { one, q } from "@/lib/db";
import { EXPECTED_MIGRATIONS } from "@/lib/migrations";
import { diagnose, technical } from "@/lib/errors";
import { cleanDbUrl, dbUrlProblem } from "@/lib/pgssl";
import { oauthProblem } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** Диагностика окружения без раскрытия значений: что задано и отвечает ли БД. */
export async function GET() {
  const env = (k: string) => (process.env[k]?.trim() ? "задан" : "НЕ ЗАДАН");
  const out: Record<string, string> = {
    AUTH_SECRET: env("AUTH_SECRET"), DATABASE_URL: process.env.DATABASE_URL || process.env.TIMEWEB_DATABASE_URL ? "задан" : "НЕ ЗАДАН",
    CRON_SECRET: env("CRON_SECRET"), PLATFORM_ADMIN_EMAILS: env("PLATFORM_ADMIN_EMAILS"),
    SELFHOSTED_LLM_URL: env("SELFHOSTED_LLM_URL"), SELFHOSTED_LLM_API_KEY: env("SELFHOSTED_LLM_API_KEY"),
  };
  out.vk_login = oauthProblem("vk") ?? "настроен"; out.yandex_login = oauthProblem("yandex") ?? "настроен";
  // Форма адреса без самого адреса: помогает увидеть опечатку, не раскрывая хост и логин.
  try {
    const raw = process.env.DATABASE_URL || process.env.TIMEWEB_DATABASE_URL;
    const u = new URL(cleanDbUrl(raw));
    const prob = dbUrlProblem(raw);
    if (prob) out.db_url_warning = `значение исправлено автоматически, но лучше вставить чистый URL: ${prob}`;
    out.db_url = `${u.protocol.replace(":", "")}, хост: ${/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) ? "IP" : u.hostname === "localhost" ? "localhost" : `домен (${u.hostname.split(".").slice(-2).join(".")})`}, порт: ${u.port || "по умолчанию"}, база: ${u.pathname.length > 1 ? "указана" : "НЕ указана"}, sslmode: ${u.searchParams.get("sslmode") ?? "нет"}`;
  } catch { out.db_url = `DATABASE_URL не разбирается как URL: ${dbUrlProblem(process.env.DATABASE_URL || process.env.TIMEWEB_DATABASE_URL) ?? "проверьте спецсимволы в пароле (@ # / ? нужно кодировать: %40 %23 %2F %3F)"}`; }
  try { await one("select 1"); out.db = "отвечает"; } catch (e) { out.db = diagnose(e); out.db_error = technical(e); }
  if (out.db === "отвечает") {
    try { await one("select 1 from kz_users limit 1"); out.tables = "есть"; } catch (e) { out.tables = diagnose(e); }
    // какие миграции применены: недостающие надо выполнить через db/adminer-schema.sql
    try {
      const done = new Set((await q<{ name: string }>("select name from kz_migrations")).map((r) => r.name));
      const missing = EXPECTED_MIGRATIONS.filter((m) => !done.has(m));
      out.schema = missing.length ? `УСТАРЕЛА, не применены: ${missing.join(", ")} — выполните db/adminer-schema.sql` : "актуальна";
    } catch { out.schema = "неизвестна (нет таблицы kz_migrations) — выполните db/adminer-schema.sql"; }
  }
  return NextResponse.json(out);
}
