"use server";
import { revalidatePath } from "next/cache";
import { requireWriter } from "./auth";
import { sectionImage } from "./article-images";

export async function sectionImageAction(itemId: string, html: string, h2Index: number, wish: string, aspect: string, o: { style?: string; logo?: boolean; pos?: string; scale?: number } = {}): Promise<Awaited<ReturnType<typeof sectionImage>>> {
  const c = await requireWriter();
  const r = await sectionImage(c.org.id, itemId, html, h2Index, wish, aspect, o);
  if (r.ok) revalidatePath("/app", "layout");
  return r;
}
