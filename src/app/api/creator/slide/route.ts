import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { generateSlideAction } from "@/lib/creator/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Один слайд карусели. Отдельный маршрут, а не серверное действие: действия Next выполняются по очереди, а слайды нужно делать по два сразу. */
export async function POST(req: NextRequest) {
  if (!(await readSession())) return NextResponse.json({ ok: false, error: "Войдите заново" }, { status: 401 });
  // запросы только с нашего сайта: куки без этой проверки отправил бы и чужой сайт
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ ok: false, error: "Запрос отклонён" }, { status: 403 });
  let b: { factoryId?: string; index?: number; total?: number; slide?: { title: string; body: string; visual: string }; style?: string; settings?: object };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Не удалось прочитать запрос" }, { status: 400 }); }
  try {
    const r = await generateSlideAction(String(b.factoryId ?? ""), Number(b.index) || 0, Number(b.total) || 1, b.slide ?? { title: "", body: "", visual: "" }, String(b.style ?? ""), b.settings ?? {});
    return NextResponse.json(r);
  } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 160) }, { status: 500 }); }
}
