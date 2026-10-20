"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { publishItemNow, publishReport, rescheduleItem } from "./drafts";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Возврат на страницу, где открыто окно материала (календарь, публикации). Проверяем, что это наш /app/…, и оставляем окно открытым. */
function back(f: FormData, r: { ok: boolean; error?: string; note?: string }): never {
  revalidatePath("/app", "layout");
  const ret = /^\/app\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_%.,-]*)?$/.test(s(f, "ret")) ? s(f, "ret") : "/app/calendar";
  const p = new URLSearchParams({ item: s(f, "id") });
  if (!r.ok && r.error) p.set("err", r.error); else if (r.note) p.set("note", r.note);
  redirect(`${ret}${ret.includes("?") ? "&" : "?"}${p}`);
}

export async function itemRescheduleAction(f: FormData) {
  const c = await requireWriter();
  const r = await rescheduleItem(c.org.id, s(f, "id"), s(f, "date"), s(f, "time"));
  back(f, r.ok ? { ok: true, note: "Дата выхода изменена" } : r);
}

export async function itemPublishAction(f: FormData) {
  const c = await requireWriter();
  const r = await publishItemNow(c.org.id, s(f, "id"));
  const rep = r.ok ? await publishReport(c.org.id, s(f, "id")) : r;
  back(f, rep.ok ? { ok: true, note: ("note" in rep ? rep.note : undefined) } : { ok: false, error: ("error" in rep ? rep.error : undefined) });
}
