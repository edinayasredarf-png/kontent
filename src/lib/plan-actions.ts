"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { q } from "./db";
import { repurposeSource } from "./pipeline";
import { addIdeas, deleteIdea, moveItem, parseIdeaLines, TIMEZONES, updateIdea } from "./plan";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (fid: string, r: { ok: boolean; error?: string }, extra = "") => {
  revalidatePath("/app", "layout");
  redirect(`/app/factories/${fid}${r.ok ? "" : `?err=${encodeURIComponent(r.error ?? "Ошибка")}`}${extra && r.ok ? `?${extra}` : ""}`);
};

export async function addIdeaAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory");
  const r = await addIdeas(c.org.id, fid, [{ topic: s(f, "topic"), hook: s(f, "hook") }], s(f, "kind"), f.get("approve") === "on", s(f, "date") || undefined);
  go(fid, r);
}

export async function addIdeasBulkAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory");
  const r = await addIdeas(c.org.id, fid, parseIdeaLines(String(f.get("list") ?? "")), s(f, "kind"), f.get("approve") === "on");
  go(fid, r);
}

export async function updateIdeaAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory");
  const r = await updateIdea(c.org.id, s(f, "id"), { topic: s(f, "topic"), hook: s(f, "hook"), kind: s(f, "kind"), date: s(f, "date") });
  go(fid, r, `open=${s(f, "id")}`);
}

export async function deleteIdeaAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory");
  go(fid, await deleteIdea(c.org.id, s(f, "id")));
}

export async function saveScheduleAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory");
  const days = [...new Set(f.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  const times = [...new Set(s(f, "times").split(/[,\s;]+/).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort().slice(0, 12);
  const tz = s(f, "tz") in TIMEZONES ? s(f, "tz") : "Europe/Moscow";
  if (!days.length) return go(fid, { ok: false, error: "Отметьте хотя бы один день публикации" });
  if (!times.length) return go(fid, { ok: false, error: "Укажите время в формате ЧЧ:ММ, например 10:00, 18:30" });
  await q("update kz_factories set schedule=$3 where id=$1 and org_id=$2", [fid, c.org.id, JSON.stringify({ days, times, tz })]);
  go(fid, { ok: true });
}

export async function repurposeAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory");
  const r = await repurposeSource(c.org.id, fid, { url: s(f, "url"), text: String(f.get("text") ?? ""), count: Number(s(f, "count")) });
  go(fid, r);
}

/** Повтор опубликованного материала: раз в N дней, не больше 5 раз. 0 дней — выключить. */
export async function setRepeatAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory"), id = s(f, "id");
  const days = Math.max(0, Math.min(365, Math.round(Number(s(f, "days"))) || 0)), times = Math.max(1, Math.min(5, Math.round(Number(s(f, "times"))) || 1));
  if (days === 0) await q("update kz_content_items set meta = meta - 'repeat' where id=$1 and org_id=$2", [id, c.org.id]);
  else await q("update kz_content_items set meta = meta || jsonb_build_object('repeat', jsonb_build_object('days',$3::int,'left',$4::int)) where id=$1 and org_id=$2 and status='published' and kind in ('post','carousel','story')", [id, c.org.id, days, times]);
  go(fid, { ok: true });
}

/** Вызывается из календаря при перетаскивании. Возвращает результат, а не перенаправляет: страница остаётся на месте. */
export async function moveItemDateAction(id: string, date: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await requireWriter();
  const r = await moveItem(c.org.id, String(id), String(date));
  if (r.ok) revalidatePath("/app/calendar");
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Не удалось перенести" };
}
