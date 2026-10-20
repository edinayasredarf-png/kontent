import { one, q } from "./db";
import { buildItem, buildImage, enqueue, processQueue } from "./pipeline";
import { cleanHtml } from "./seo";

type Result = { ok: true; note?: string } | { ok: false; error: string };

/** SQL-условие «материал — черновик»: созданный вручную и ещё не отправленный в план или публикацию. Черновики не видны в плане, календаре и публикациях. */
export const DRAFT = "coalesce((meta->>'draft')::boolean,false)";

export interface DraftItem {
  id: string; factory_id: string; kind: string; topic: string; body: string; status: string; image_id: string | null;
  image_error: string | null; own_image: boolean; slides: string[]; channels: string[];
}

/** Материалы окна «Созданное»: только черновики этой организации, в порядке создания. */
export async function loadDrafts(orgId: string, ids: string[]): Promise<DraftItem[]> {
  if (!ids.length) return [];
  const rows = await q<Omit<DraftItem, "slides" | "channels"> & { chans: string[] | null }>(
    `select i.id,i.factory_id,i.kind,i.topic,i.body,i.status,i.image_id,i.meta->>'imageError' image_error,coalesce((i.meta->>'imageOwn')::boolean,false) own_image,
            (select array_agg(ch.title order by ch.created_at) from kz_channels ch where ch.id = any(f.channel_ids)) chans
       from kz_content_items i left join kz_factories f on f.id=i.factory_id
      where i.org_id=$1 and i.id = any($2::uuid[]) and ${DRAFT.replace(/meta/g, "i.meta")} order by i.created_at`, [orgId, ids]);
  const slides = await q<{ id: string; item_id: string }>("select id,item_id from kz_assets where org_id=$1 and position>=0 and item_id = any($2::uuid[]) order by item_id,position", [orgId, rows.map((r) => r.id)]);
  return rows.map(({ chans, ...r }) => ({ ...r, slides: slides.filter((s) => s.item_id === r.id).map((s) => s.id), channels: chans ?? [] }));
}

export async function listFactoryDrafts(orgId: string, factoryId: string): Promise<{ id: string; kind: string; topic: string; status: string }[]> {
  return q(`select id,kind,topic,status from kz_content_items where org_id=$1 and factory_id=$2 and ${DRAFT} order by created_at desc limit 20`, [orgId, factoryId]);
}

export async function saveDraftBody(orgId: string, id: string, text: string): Promise<Result> {
  const it = await one<{ kind: string }>(`select kind from kz_content_items where id=$1 and org_id=$2 and ${DRAFT}`, [id, orgId]);
  if (!it) return { ok: false, error: "Черновик не найден" };
  const body = ["seo", "email", "guide"].includes(it.kind) ? cleanHtml(text) : text.trim().slice(0, 20000);
  await q("update kz_content_items set body=$3, updated_at=now() where id=$1 and org_id=$2", [id, orgId, body]);
  return { ok: true };
}

/** Переделать материал заново: тот же заход, новая генерация (платная, как создание). */
export async function regenDraft(orgId: string, id: string): Promise<Result> {
  const r = await one<{ id: string }>(`update kz_content_items set status='approved', updated_at=now() where id=$1 and org_id=$2 and ${DRAFT} and status in ('ready','failed','approved','idea') returning id`, [id, orgId]);
  if (!r) return { ok: false, error: "Черновик не найден" };
  const b = await buildItem(orgId, id);
  return b.ok ? { ok: true } : { ok: false, error: b.error ?? "Не удалось создать материал" };
}

export async function imageForDraft(orgId: string, id: string, prompt: string): Promise<Result> {
  const it = await one<{ id: string }>(`select id from kz_content_items where id=$1 and org_id=$2 and ${DRAFT}`, [id, orgId]);
  if (!it) return { ok: false, error: "Черновик не найден" };
  const r = await buildImage(orgId, id, prompt.trim() || undefined);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * «В контент-план»: материал получает дату и время выхода (по часовому поясу завода) и перестаёт быть черновиком.
 * Время хранится как момент публикации: воркер выпустит материал в каналы завода, когда оно наступит.
 */
export async function draftToPlan(orgId: string, id: string, date: string, time: string): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Выберите дату" };
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "Укажите время публикации" };
  const it = await one<{ tz: string | null; pub_at: string; future: boolean }>(
    `select f.schedule->>'tz' tz, to_char((($3 || ' ' || $4)::timestamp at time zone coalesce(f.schedule->>'tz','Europe/Moscow')) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') pub_at,
            (($3 || ' ' || $4)::timestamp at time zone coalesce(f.schedule->>'tz','Europe/Moscow')) > now() future
       from kz_content_items i join kz_factories f on f.id=i.factory_id where i.id=$1 and i.org_id=$2 and ${DRAFT.replace(/meta/g, "i.meta")} and i.status='ready'`, [id, orgId, date, time]);
  if (!it) return { ok: false, error: "Материал ещё создаётся или не найден" };
  if (!it.future) return { ok: false, error: "Это время уже прошло. Выберите будущие дату и время или нажмите «Опубликовать сейчас»" };
  await q("update kz_content_items set planned_for=$3::date, meta = (meta - 'draft') || jsonb_build_object('publishAt',$4::text), updated_at=now() where id=$1 and org_id=$2", [id, orgId, date, it.pub_at]);
  return { ok: true };
}

export async function draftPublishNow(orgId: string, id: string): Promise<Result> {
  const it = await one<{ id: string }>(`select id from kz_content_items where id=$1 and org_id=$2 and ${DRAFT} and status='ready'`, [id, orgId]);
  if (!it) return { ok: false, error: "Материал ещё создаётся или не найден" };
  await q("update kz_content_items set planned_for=current_date, meta = meta - 'draft', updated_at=now() where id=$1 and org_id=$2", [id, orgId]);
  const e = await enqueue(orgId, id);
  if (!e.ok) { await q("update kz_content_items set meta = meta || '{\"draft\":true}'::jsonb, planned_for=null where id=$1", [id]); return { ok: false, error: e.error ?? "Не удалось поставить в очередь" }; }
  await processQueue(10, id);
  return { ok: true };
}

export async function discardDraft(orgId: string, id: string): Promise<void> {
  const it = await one<{ image_id: string | null }>(`delete from kz_content_items where id=$1 and org_id=$2 and ${DRAFT} returning image_id`, [id, orgId]);
  if (it?.image_id) await q("delete from kz_assets where id=$1 and org_id=$2", [it.image_id, orgId]);
}

const EDITABLE_ITEM = ["idea", "approved", "ready", "failed", "rejected"];

/** Перенос выхода материала из окна: дата всегда; время — только для готового (тогда он уйдёт в каналы завода в этот момент). */
export async function rescheduleItem(orgId: string, id: string, date: string, time: string): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Выберите дату" };
  const it = await one<{ status: string }>("select status from kz_content_items where id=$1 and org_id=$2", [id, orgId]);
  if (!it) return { ok: false, error: "Материал не найден" };
  if (!EDITABLE_ITEM.includes(it.status)) return { ok: false, error: "Этот материал уже в очереди или опубликован: перенести его нельзя" };
  if (it.status === "ready" && /^\d{2}:\d{2}$/.test(time)) {
    const r = await draftToPlanAny(orgId, id, date, time);
    return r;
  }
  await q("update kz_content_items set planned_for=$3::date, updated_at=now() where id=$1 and org_id=$2", [id, orgId, date]);
  return { ok: true };
}

async function draftToPlanAny(orgId: string, id: string, date: string, time: string): Promise<Result> {
  const it = await one<{ pub_at: string; future: boolean }>(
    `select to_char((($3 || ' ' || $4)::timestamp at time zone coalesce(f.schedule->>'tz','Europe/Moscow')) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') pub_at,
            (($3 || ' ' || $4)::timestamp at time zone coalesce(f.schedule->>'tz','Europe/Moscow')) > now() future
       from kz_content_items i join kz_factories f on f.id=i.factory_id where i.id=$1 and i.org_id=$2`, [id, orgId, date, time]);
  if (!it) return { ok: false, error: "Материал не найден" };
  if (!it.future) return { ok: false, error: "Это время уже прошло. Выберите будущие дату и время или нажмите «Опубликовать сейчас»" };
  await q("update kz_content_items set planned_for=$3::date, meta = meta || jsonb_build_object('publishAt',$4::text), updated_at=now() where id=$1 and org_id=$2", [id, orgId, date, it.pub_at]);
  return { ok: true };
}

export async function publishItemNow(orgId: string, id: string): Promise<Result> {
  const e = await enqueue(orgId, id);
  if (!e.ok) return { ok: false, error: e.error ?? "Не удалось поставить в очередь" };
  await q("update kz_content_items set meta = meta - 'publishAt' where id=$1 and org_id=$2", [id, orgId]);
  await processQueue(10, id);
  return { ok: true };
}

/** Итог только что выполненной публикации: по каждому каналу — успех, ошибка или «опубликовано, но…» (например, картинка не загрузилась). */
export async function publishReport(orgId: string, id: string): Promise<{ ok: boolean; note?: string; error?: string }> {
  const rows = await q<{ status: string; error: string | null; channel: string }>(
    `select p.status,p.error,ch.title channel from kz_publications p join kz_channels ch on ch.id=p.channel_id where p.item_id=$1 and p.org_id=$2 order by p.created_at`, [id, orgId]);
  if (!rows.length) return { ok: true, note: "Отправлено в публикацию." };
  const bad = rows.filter((r) => r.status === "failed"), warn = rows.filter((r) => r.status === "published" && r.error), queued = rows.filter((r) => ["queued", "sending"].includes(r.status));
  if (bad.length) return { ok: false, error: `Не опубликовалось: ${bad.map((r) => `${r.channel} — ${r.error ?? "ошибка"}`).join("; ")}` };
  if (warn.length) return { ok: true, note: `Опубликовано, но: ${warn.map((r) => `${r.channel} — ${r.error}`).join("; ")}` };
  if (queued.length) return { ok: true, note: "Поставлено в очередь, отправка займёт до нескольких минут. Статус по каналам виден в разделе «Публикации»." };
  return { ok: true, note: "Опубликовано во все каналы." };
}
