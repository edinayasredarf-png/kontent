import { NextRequest, NextResponse } from "next/server";
import { readSession, requireCtx, canWrite } from "@/lib/auth";
import { one } from "@/lib/db";
import { MAX_UPLOAD, processImage, saveAsset, type AssetKind } from "@/lib/assets";
import { describeImage } from "@/lib/images";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Загрузка логотипа, фото продукта и референсов бренда. Тело — multipart: brandId, kind, file. */
export async function POST(req: NextRequest) {
  if (!(await readSession())) return NextResponse.json({ error: "Войдите заново" }, { status: 401 });
  const c = await requireCtx();
  if (!canWrite(c.org.role)) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Не удалось прочитать файл (возможно, он больше 4 МБ)" }, { status: 400 }); }
  const kind = String(form.get("kind") ?? "") as AssetKind;
  const brandId = String(form.get("brandId") ?? "");
  const file = form.get("file");
  if (!["logo", "product", "reference"].includes(kind)) return NextResponse.json({ error: "Неизвестный тип файла" }, { status: 400 });
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: "Файл больше 4 МБ" }, { status: 413 });
  if (!(await one("select 1 from kz_brands where id=$1 and org_id=$2", [brandId, c.org.id]))) return NextResponse.json({ error: "Бренд не найден" }, { status: 404 });
  try {
    const p = await processImage(Buffer.from(await file.arrayBuffer()), kind);
    let note = "", noteError = "";
    if (kind !== "logo") { try { note = await describeImage(p, kind as "product" | "reference"); } catch (e) { noteError = (e as Error).message; } }
    const id = await saveAsset(c.org.id, brandId, kind, file.name, p, note);
    return NextResponse.json({ id, note: !!note, noteError });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: /Input buffer|unsupported image|corrupt|VipsJpeg|bad seek|pixel/i.test(m) ? "Файл не похож на изображение или слишком большой" : m }, { status: 400 });
  }
}
