"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { one, q } from "./db";
import { cleanHtml } from "./seo";
import { snapshot } from "./versions";
import { calendarColor } from "./calendar";
import { CALENDAR_EDITABLE, validateCalendarEdit } from "./calendar-edit";
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

/** Edits stay in the same drawer. Compare the version atomically so an older
 * browser tab cannot overwrite content generated or changed in the meantime. */
export async function itemEditAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), topic = s(f, "topic"), hook = s(f, "hook"), color = s(f, "color"), raw = String(f.get("body") ?? "");
  const error = validateCalendarEdit(topic, hook, raw, color);
  if (error) back(f, { ok: false, error });
  if (!Number.isFinite(Date.parse(s(f, "version")))) back(f, { ok: false, error: "Обновите материал перед сохранением" });
  const it = await one<{ kind: string; status: string }>("select kind,status from kz_content_items where id=$1 and org_id=$2", [id, c.org.id]);
  if (!it || !CALENDAR_EDITABLE.includes(it.status)) back(f, { ok: false, error: "Материал уже опубликован, в очереди или создаётся. Его нельзя изменить." });
  const body = ["seo", "email", "guide"].includes(it!.kind) ? cleanHtml(raw) : raw.trim();
  await snapshot(c.org.id, id, "До правки в календаре");
  const rows = await q(`update kz_content_items set topic=$3,hook=$4,body=$5,
    meta=case when $6::text='' then meta-'calendarColor' else meta || jsonb_build_object('calendarColor',$6::text) end,
    updated_at=now() where id=$1 and org_id=$2 and status=any($8::text[]) and updated_at=$7::timestamptz returning id`,
    [id, c.org.id, topic, hook, body, color, s(f, "version"), CALENDAR_EDITABLE]);
  back(f, rows.length ? { ok: true, note: "Изменения сохранены" } : { ok: false, error: "Материал изменился в другом окне. Проверьте актуальную версию и повторите правку." });
}

export async function itemColorAction(f: FormData) {
  const c = await requireWriter(), color = s(f, "color");
  if (color && !calendarColor(color)) back(f, { ok: false, error: "Выберите цвет из палитры" });
  const rows = await q(`update kz_content_items set meta=case when $3::text='' then meta-'calendarColor'
    else meta || jsonb_build_object('calendarColor',$3::text) end, updated_at=now() where id=$1 and org_id=$2 returning id`, [s(f, "id"), c.org.id, color]);
  back(f, rows.length ? { ok: true, note: "Цвет материала сохранён" } : { ok: false, error: "Материал не найден" });
}
