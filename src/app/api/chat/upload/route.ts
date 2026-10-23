import { NextRequest, NextResponse } from "next/server";
import { canWrite, readSession, requireCtx } from "@/lib/auth";
import { processImage, saveAsset } from "@/lib/assets";
import { fileToText } from "@/lib/kb/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX = 4 * 1024 * 1024;
const IMG = /^image\/(png|jpe?g|webp|gif)$/;

/** Вложение в чат: картинка (перекодируется, метаданные вырезаются) или документ (txt, md, docx, html, csv: сохраняется его текст). Возвращает id для сообщения. */
export async function POST(req: NextRequest) {
  if (!(await readSession())) return NextResponse.json({ error: "Войдите заново" }, { status: 401 });
  const c = await requireCtx();
  if (!canWrite(c.org.role)) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Не удалось прочитать файл (больше 4 МБ?)" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Файл больше 4 МБ" }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const name = (file.name || "файл").slice(0, 100);
  try {
    if (IMG.test(file.type)) {
      const p = await processImage(buf, "generated");
      const id = await saveAsset(c.org.id, null, "generated", name, p, "вложение чата");
      return NextResponse.json({ id, name, kind: "image" });
    }
    const t = await fileToText(name, buf);
    if (t.text.trim().length < 20) return NextResponse.json({ error: "В файле почти нет текста" }, { status: 400 });
    const text = Buffer.from(t.text.slice(0, 60_000), "utf8");
    const id = await saveAsset(c.org.id, null, "generated", name, { data: text, mime: "text/plain", width: 0, height: 0 }, "вложение чата");
    return NextResponse.json({ id, name, kind: "doc" });
  } catch (e) { return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 400 }); }
}
