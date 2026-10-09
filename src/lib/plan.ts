import { one, q, tx } from "./db";
import type { Result } from "./pipeline";

export const KINDS = ["post", "carousel", "reels", "article", "story"] as const;
export type Kind = (typeof KINDS)[number];
const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Свободные даты для новых идей: идут после последней запланированной (но не раньше завтра) и только в дни публикации
 * из расписания завода — раньше план клал идеи на выходные, когда завод публиковать не должен.
 */
export async function allocateDates(factoryId: string, count: number): Promise<string[]> {
  const f = await one<{ schedule: { days?: number[] }; last: string | null }>(
    `select schedule,(select to_char(max(planned_for),'YYYY-MM-DD') from kz_content_items where factory_id=$1) last from kz_factories where id=$1`, [factoryId]);
  const days = f?.schedule?.days?.length ? f.schedule.days : [0, 1, 2, 3, 4, 5, 6];
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + 1);
  if (f?.last) { const l = new Date(f.last + "T12:00:00"); if (l >= d) { d.setTime(l.getTime()); d.setDate(d.getDate() + 1); } }
  const out: string[] = [];
  for (let guard = 0; out.length < count && guard < 800; guard++) {
    if (days.includes(d.getDay())) out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const clean = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export async function addIdeas(orgId: string, factoryId: string, lines: { topic: string; hook?: string }[], kind: string, approved: boolean, date?: string): Promise<Result & { added?: number }> {
  const fac = await one<{ brand_id: string; formats: string[] }>("select brand_id,formats from kz_factories where id=$1 and org_id=$2", [factoryId, orgId]);
  if (!fac) return { ok: false, error: "Завод не найден" };
  const rows = lines.map((l) => ({ topic: clean(l.topic, 300), hook: clean(l.hook ?? "", 300) })).filter((l) => l.topic.length >= 3);
  if (!rows.length) return { ok: false, error: "Введите тему идеи (минимум 3 символа)" };
  if (rows.length > 100) return { ok: false, error: "Не больше 100 идей за раз" };
  const k = isKind(kind) ? kind : (fac.formats[0] as Kind) ?? "post";
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Неверная дата" };
  const dates = date ? rows.map(() => date) : await allocateDates(factoryId, rows.length);
  await tx(async (run) => {
    for (let i = 0; i < rows.length; i++) {
      await run(`insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,planned_for,status,meta) values($1,$2,$3,$4,$5,$6,$7,$8,'{"manual":true}')`,
        [orgId, factoryId, fac.brand_id, k, rows[i].topic, rows[i].hook, dates[i], approved ? "approved" : "idea"]);
    }
  });
  return { ok: true, added: rows.length };
}

/** Разбор списка: «Тема» или «Тема | хук», по строке на идею; нумерация и маркеры в начале строки отбрасываются. */
export function parseIdeaLines(text: string): { topic: string; hook?: string }[] {
  return text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).map((l) => {
    const [topic, ...rest] = l.split("|");
    return { topic, hook: rest.join("|") || undefined };
  });
}

const EDITABLE = ["idea", "approved", "ready", "failed", "rejected"];

export async function updateIdea(orgId: string, id: string, v: { topic: string; hook: string; kind: string; date: string }): Promise<Result> {
  const topic = clean(v.topic, 300);
  if (topic.length < 3) return { ok: false, error: "Тема — минимум 3 символа" };
  if (!isKind(v.kind)) return { ok: false, error: "Неверный формат" };
  if (v.date && !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return { ok: false, error: "Неверная дата" };
  const r = await q("update kz_content_items set topic=$3,hook=$4,kind=$5,planned_for=$6,updated_at=now() where id=$1 and org_id=$2 and status = any($7::text[]) returning id",
    [id, orgId, topic, clean(v.hook, 300), v.kind, v.date || null, EDITABLE]);
  return r.length ? { ok: true } : { ok: false, error: "Эту идею сейчас нельзя изменить (уже в очереди, публикуется или опубликована)" };
}

export async function deleteIdea(orgId: string, id: string): Promise<Result> {
  const it = await one<{ image_id: string | null }>("delete from kz_content_items where id=$1 and org_id=$2 and status = any($3::text[]) returning image_id", [id, orgId, EDITABLE]);
  if (!it) return { ok: false, error: "Эту идею нельзя удалить (в очереди, публикуется или уже опубликована)" };
  if (it.image_id) await q("delete from kz_assets where id=$1 and org_id=$2", [it.image_id, orgId]);
  return { ok: true };
}

/** Дней до конца плана: сколько ещё идей запланировано вперёд (только не опубликованные и не отклонённые). */
export async function planRunway(factoryId: string): Promise<number | null> {
  const r = await one<{ d: string | null }>("select to_char(max(planned_for),'YYYY-MM-DD') d from kz_content_items where factory_id=$1 and status in ('idea','approved','ready','scheduled')", [factoryId]);
  if (!r?.d) return null;
  return Math.ceil((new Date(r.d + "T12:00:00").getTime() - Date.now()) / 86_400_000);
}
