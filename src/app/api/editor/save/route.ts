import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { canWrite, readSession, requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { MAX_UPLOAD, saveAsset } from "@/lib/assets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const EDITABLE = ["idea", "approved", "ready", "failed"];

/**
 * Сохранение картинки из визуального редактора. multipart: id (материал), target (slide:N | info | image), file (JPEG с холста).
 * Новая картинка записывается до удаления старой: при сбое прежняя остаётся.
 */
export async function POST(req: NextRequest) {
  if (!(await readSession())) return NextResponse.json({ error: "Войдите заново" }, { status: 401 });
  const c = await requireCtx();
  if (!canWrite(c.org.role)) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Не удалось прочитать файл" }, { status: 400 }); }
  const id = String(form.get("id") ?? ""), target = String(form.get("target") ?? ""), file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Нет картинки" }, { status: 400 });
  if (file.size > MAX_UPLOAD * 2) return NextResponse.json({ error: "Картинка слишком большая" }, { status: 413 });
  const it = await one<{ kind: string; status: string; brand_id: string; image_id: string | null; meta: { carousel?: { custom?: number[] } } }>(
    "select kind,status,brand_id,image_id,meta from kz_content_items where id=$1 and org_id=$2", [id, c.org.id]);
  if (!it) return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  if (!EDITABLE.includes(it.status)) return NextResponse.json({ error: "Этот материал уже нельзя менять (в очереди или опубликован)" }, { status: 409 });

  let processed;
  try {
    const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1440, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    processed = { data, mime: "image/jpeg", width: info.width, height: info.height };
  } catch { return NextResponse.json({ error: "Файл не похож на изображение" }, { status: 400 }); }

  try {
    const m = /^slide:(\d{1,2})$/.exec(target);
    if (m && it.kind === "carousel") {
      const pos = Number(m[1]);
      const old = await one<{ id: string }>("select id from kz_assets where item_id=$1 and position=$2 and org_id=$3", [id, pos, c.org.id]);
      if (!old) return NextResponse.json({ error: "Слайд не найден" }, { status: 404 });
      await saveAsset(c.org.id, it.brand_id, "generated", `slide-${pos + 1}-edit.jpg`, processed, "", { itemId: id, position: pos });
      await q("delete from kz_assets where id=$1 and org_id=$2", [old.id, c.org.id]);
      const custom = [...new Set([...(it.meta?.carousel?.custom ?? []), pos])];
      await q("update kz_content_items set meta = jsonb_set(meta,'{carousel,custom}', $2::jsonb, true), updated_at=now() where id=$1", [id, JSON.stringify(custom)]);
    } else if (target === "info" && it.kind === "infographic") {
      const old = await one<{ id: string }>("select id from kz_assets where item_id=$1 and position=0 and org_id=$2", [id, c.org.id]);
      await saveAsset(c.org.id, it.brand_id, "generated", "infographic-edit.jpg", processed, "", { itemId: id, position: 0 });
      if (old) await q("delete from kz_assets where id=$1 and org_id=$2", [old.id, c.org.id]);
      await q("update kz_content_items set meta = meta || '{\"infographicCustom\":true}'::jsonb, updated_at=now() where id=$1", [id]);
    } else if (target === "image" && !["carousel", "infographic"].includes(it.kind)) {
      const nid = await saveAsset(c.org.id, it.brand_id, "generated", "edited.jpg", processed);
      await q("update kz_content_items set image_id=$2, updated_at=now() where id=$1", [id, nid]);
      if (it.image_id) await q("delete from kz_assets where id=$1 and org_id=$2", [it.image_id, c.org.id]);
    } else return NextResponse.json({ error: "Неизвестная цель сохранения" }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message.slice(0, 160) }, { status: 500 }); }
  revalidatePath("/app", "layout");
  return NextResponse.json({ ok: true });
}
