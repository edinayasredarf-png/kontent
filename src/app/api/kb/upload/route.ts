import { NextRequest, NextResponse } from "next/server";
import { readSession, requireCtx, canWrite } from "@/lib/auth";
import { one } from "@/lib/db";
import { fileToText, isKind, KB_LIMITS } from "@/lib/kb/ingest";
import { addDoc } from "@/lib/kb/docs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Загрузка документа в базу знаний бренда: multipart brandId, kind, file. */
export async function POST(req: NextRequest) {
  if (!(await readSession())) return NextResponse.json({ error: "Войдите заново" }, { status: 401 });
  const c = await requireCtx();
  if (!canWrite(c.org.role)) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Не удалось прочитать файл (возможно, он больше 4 МБ)" }, { status: 400 }); }
  const brandId = String(form.get("brandId") ?? ""), file = form.get("file"), kindRaw = form.get("kind");
  const kind = isKind(kindRaw) ? kindRaw : "other";
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
  if (file.size > KB_LIMITS.fileBytes) return NextResponse.json({ error: "Файл больше 4 МБ" }, { status: 413 });
  if (!(await one("select 1 from kz_brands where id=$1 and org_id=$2", [brandId, c.org.id]))) return NextResponse.json({ error: "Бренд не найден" }, { status: 404 });
  try {
    const t = await fileToText(file.name, Buffer.from(await file.arrayBuffer()));
    const r = await addDoc(c.org.id, brandId, { kind, title: t.title, text: t.text, useStyle: kind === "article" });
    return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ id: r.id });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
