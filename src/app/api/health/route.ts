import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { diagnose } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Диагностика окружения без раскрытия значений: что задано и отвечает ли БД. */
export async function GET() {
  const env = (k: string) => (process.env[k]?.trim() ? "задан" : "НЕ ЗАДАН");
  const out: Record<string, string> = {
    AUTH_SECRET: env("AUTH_SECRET"), DATABASE_URL: process.env.DATABASE_URL || process.env.TIMEWEB_DATABASE_URL ? "задан" : "НЕ ЗАДАН",
    CRON_SECRET: env("CRON_SECRET"), PLATFORM_ADMIN_EMAILS: env("PLATFORM_ADMIN_EMAILS"),
    SELFHOSTED_LLM_URL: env("SELFHOSTED_LLM_URL"), SELFHOSTED_LLM_API_KEY: env("SELFHOSTED_LLM_API_KEY"),
  };
  try { await one("select 1"); out.db = "отвечает"; } catch (e) { out.db = diagnose(e); }
  if (out.db === "отвечает") {
    try { await one("select 1 from kz_users limit 1"); out.tables = "есть"; } catch (e) { out.tables = diagnose(e); }
  }
  return NextResponse.json(out);
}
