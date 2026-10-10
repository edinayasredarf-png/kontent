import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canWrite, readSession, requireCtx } from "@/lib/auth";
import { one } from "@/lib/db";
import { MAX_UPLOAD } from "@/lib/assets";
import { CAROUSEL_STYLES } from "@/lib/postsettings";
import { cleanSettings } from "@/lib/postsettings";
import { cleanSlides, prepCover, renderForItem, slideHeight } from "@/lib/carousel/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Своя картинка вместо фона обложки карусели. multipart: id (материал), file. Слайды перерисовываются бесплатно. */
export async function POST(req: NextRequest) {
  if (!(await readSession())) return NextResponse.json({ error: "Войдите заново" }, { status: 401 });
  const c = await requireCtx();
  if (!canWrite(c.org.role)) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Не удалось прочитать файл (возможно, он больше 4 МБ)" }, { status: 400 }); }
  const id = String(form.get("id") ?? ""), file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: "Файл больше 4 МБ" }, { status: 413 });
  const it = await one<{ status: string; meta: { carousel?: { slides: unknown[]; style: string } }; brief: unknown }>(
    "select i.status,i.meta,f.brief from kz_content_items i join kz_factories f on f.id=i.factory_id where i.id=$1 and i.org_id=$2 and i.kind='carousel'", [id, c.org.id]);
  if (!it || !["idea", "approved", "ready", "failed"].includes(it.status)) return NextResponse.json({ error: "Эту карусель сейчас нельзя изменить" }, { status: 409 });
  const slides = cleanSlides(it.meta?.carousel?.slides);
  if (slides.length < 2) return NextResponse.json({ error: "У карусели нет слайдов для перерисовки" }, { status: 409 });
  try {
    const cover = await prepCover(Buffer.from(await file.arrayBuffer()), slideHeight(cleanSettings(it.brief).carouselFormat));
    const style = (it.meta?.carousel?.style && it.meta.carousel.style in CAROUSEL_STYLES ? it.meta.carousel.style : "brand") as keyof typeof CAROUSEL_STYLES;
    await renderForItem(c.org.id, id, slides, style, cover);
    revalidatePath("/app", "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: /Input buffer|unsupported image|corrupt|VipsJpeg|bad seek|pixel/i.test(m) ? "Файл не похож на изображение или слишком большой" : `Не удалось обработать: ${m.slice(0, 120)}` }, { status: 400 });
  }
}
