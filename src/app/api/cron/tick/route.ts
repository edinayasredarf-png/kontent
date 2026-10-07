import { NextRequest, NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { withLock } from "@/lib/db";
import { tick } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // без секрета эндпоинт закрыт для всех
  const a = Buffer.from(req.headers.get("authorization") || "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LOCK = 727001;

/**
 * Отвечает сразу (202), а работу делает в фоне: у внешних планировщиков таймаут ~30 с, а проход с генерацией текстов
 * длиннее. Параллельный проход не стартует — advisory-lock: иначе два воркера дважды пополнили бы план и списали деньги.
 * Результат прохода — в Runtime Logs (строка «[tick]»). `?wait=1` — дождаться и вернуть отчёт (для ручной проверки).
 */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const run = async () => {
    try {
      const rep = await withLock(LOCK, () => tick());
      console.log("[tick]", rep ? JSON.stringify(rep) : "пропущен: предыдущий проход ещё идёт");
      return rep;
    } catch (e) { console.error("[tick] ошибка:", e); throw e; }
  };
  if (req.nextUrl.searchParams.get("wait") === "1") {
    try { const rep = await run(); return NextResponse.json({ ok: true, ...(rep ?? { skipped: true }) }); }
    catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 }); }
  }
  after(() => run().then(() => undefined, () => undefined));
  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}
export const GET = handle;
export const POST = handle;
