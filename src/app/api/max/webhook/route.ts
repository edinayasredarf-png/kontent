import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleUpdate } from "@/lib/max-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Вебхук бота MAX. Запрос принимается только с секретом из подписки (заголовок X-Max-Bot-Api-Secret). MAX ждёт ответ 200 не дольше 30 секунд. */
export async function POST(req: NextRequest) {
  const secret = process.env.MAX_WEBHOOK_SECRET?.trim() ?? "";
  const got = req.headers.get("x-max-bot-api-secret") ?? "";
  if (!secret || !same(secret, got)) { console.warn("[max-webhook] отклонён: нет MAX_WEBHOOK_SECRET или секрет в заголовке не совпал"); return new NextResponse("forbidden", { status: 403 }); }
  try { const u = await req.json(); console.log("[max-webhook] событие:", u?.update_type); await handleUpdate(u); }
  catch (e) { console.error("[max-webhook]", (e as Error).message); } // 200 всегда: иначе MAX будет слать событие повторно, а ошибка у нас внутренняя
  return NextResponse.json({ ok: true });
}
