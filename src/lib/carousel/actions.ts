"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "../auth";
import { one, q } from "../db";
import { CAROUSEL_STYLES, cleanLink, cleanSettings, EMOJI, HASHTAGS, LENGTHS, POST_TYPES } from "../postsettings";
import { setCarouselCover } from "../pipeline";
import { cleanSlides, renderForItem } from "./service";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (fid: string, id: string, err?: string) => { revalidatePath("/app", "layout"); redirect(`/app/factories/${fid}?view=list&open=${id}${err ? `&err=${encodeURIComponent(err)}` : ""}#i-${id}`); };

/** Правка текстов слайдов и оформления с перерисовкой. Рисование локальное и бесплатное; подпись к посту правится обычным полем материала. */
export async function saveCarouselAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), fid = s(f, "factory");
  const it = await one<{ status: string }>("select status from kz_content_items where id=$1 and org_id=$2 and kind='carousel'", [id, c.org.id]);
  if (!it || !["idea", "approved", "ready", "failed"].includes(it.status)) return back(fid, id, "Эту карусель сейчас нельзя изменить");
  const raw = Array.from({ length: 10 }, (_, i) => ({ title: s(f, `title_${i}`), body: s(f, `body_${i}`) }));
  const slides = cleanSlides(raw);
  if (slides.length < 2) return back(fid, id, "В карусели должно быть минимум 2 слайда с заголовками");
  const style = (s(f, "style") in CAROUSEL_STYLES ? s(f, "style") : "brand") as keyof typeof CAROUSEL_STYLES;
  try { await renderForItem(c.org.id, id, slides, style); } catch (e) { return back(fid, id, `Не удалось перерисовать: ${(e as Error).message}`); }
  back(fid, id);
}

export async function carouselCoverAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), fid = s(f, "factory");
  const r = await setCarouselCover(c.org.id, id, s(f, "mode") === "ai" ? "ai" : "none");
  back(fid, id, r.ok ? undefined : r.error);
}

/** Настройки контента завода: типы постов, длина, примеры, ссылка, призыв, эмодзи, хештеги, карусели. Всё проходит cleanSettings. */
export async function saveContentSettingsAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory");
  const link = cleanLink(s(f, "link"));
  if (s(f, "link") && !link) { redirect(`/app/factories/${fid}?err=${encodeURIComponent("Ссылка должна быть адресом сайта (http:// или https://)")}`); }
  const st = cleanSettings({
    postTypes: f.getAll("postTypes").map(String), length: s(f, "length"), examples: String(f.get("examples") ?? ""), link, cta: s(f, "cta"),
    learn: f.get("learn") === "on", hashtags: s(f, "hashtags"), emoji: s(f, "emoji"), slides: Number(s(f, "slides")), carouselStyle: s(f, "carouselStyle"), carouselCover: s(f, "carouselCover"), carouselFormat: s(f, "carouselFormat"),
  });
  await q("update kz_factories set brief = brief || $3::jsonb where id=$1 and org_id=$2", [fid, c.org.id, JSON.stringify(st)]);
  revalidatePath(`/app/factories/${fid}`);
  redirect(`/app/factories/${fid}`);
}

