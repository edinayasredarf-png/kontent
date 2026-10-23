"use server";
import { requireCtx, requireWriter } from "../auth";
import { one, q } from "../db";
import { createFromNews, MAKE_KINDS } from "../monitor/news";
import { buildPlan } from "../pipeline";
import { discardDraft, draftPublishNow, draftToPlan, publishItemNow, publishReport, regenDraft, rescheduleItem, saveDraftBody, setItemChannels } from "../drafts";
import { cleanLink, cleanSettings, EMOJI, HASHTAGS, LENGTHS } from "../postsettings";
import { snapshot, restoreVersion } from "../versions";
import { saveFactoryPatch, type FactoryPatch } from "./factory-patch";
import { rewriteFragment } from "./writer";
import { hydrateCards, type Card, type CardRef } from "./cards";

const UUID = /^[0-9a-f-]{36}$/i;
type R = { ok: boolean; error?: string; note?: string; card?: Card | null; ids?: string[] };
const fail = (error: string): R => ({ ok: false, error });
const one1 = async (orgId: string, ref: CardRef) => (await hydrateCards(orgId, [ref]))[0] ?? null;

/** Свежие данные карточки (для кнопок «обновить» и смены периода). */
export async function cardRefreshAction(ref: CardRef): Promise<R> {
  const c = await requireCtx();
  return { ok: true, card: await one1(c.org.id, ref) };
}

export async function cardLikeNewsAction(id: string, on: boolean): Promise<R> {
  const c = await requireWriter();
  if (!UUID.test(id)) return fail("Новость не найдена");
  await q("update kz_feed_items set status=$3 where id=$1 and org_id=$2 and status<>'used'", [id, c.org.id, on ? "saved" : "new"]);
  return { ok: true, card: await one1(c.org.id, { t: "news", ids: [id] }) };
}

/** Материал из новости. «Сразу» — черновик, который показывается тут же в чате; «в план» — только идея. Платно: нажатие кнопки и есть подтверждение. */
export async function cardCreateFromNewsAction(newsId: string, factoryId: string, kinds: string[], mode: "now" | "ideas"): Promise<R> {
  const c = await requireWriter();
  if (!UUID.test(newsId) || !UUID.test(factoryId)) return fail("Выберите новость и завод");
  const ks = [...new Set(kinds.map(String).filter((k) => MAKE_KINDS.includes(k)))].slice(0, 2);
  if (!ks.length) return fail("Выберите тип материала");
  const r = await createFromNews(c.org.id, newsId, factoryId, ks, mode === "now", { draft: mode === "now" });
  if (!r.ok) return fail(r.error);
  return { ok: true, ids: r.ids, note: mode === "ideas" ? `Идей добавлено в контент-план: ${r.ids.length}` : undefined, error: r.error, card: mode === "now" ? await one1(c.org.id, { t: "item", ids: r.ids }) : null };
}

const itemCard = async (orgId: string, id: string) => one1(orgId, { t: "item", ids: [id] });

export async function cardItemSaveAction(id: string, body: string): Promise<R> {
  const c = await requireWriter();
  await snapshot(c.org.id, id, "до ручной правки");
  const r = await saveDraftBody(c.org.id, id, String(body ?? ""));
  return r.ok ? { ok: true, note: "Текст сохранён", card: await itemCard(c.org.id, id) } : fail(r.error);
}
export async function cardItemChannelsAction(id: string, channelIds: string[]): Promise<R> {
  const c = await requireWriter();
  const r = await setItemChannels(c.org.id, id, channelIds.map(String).filter((x) => UUID.test(x)));
  return r.ok ? { ok: true, card: await itemCard(c.org.id, id) } : fail(r.error);
}
export async function cardItemPublishAction(id: string): Promise<R> {
  const c = await requireWriter();
  const isDraft = !!(await one("select 1 from kz_content_items where id=$1 and org_id=$2 and coalesce((meta->>'draft')::boolean,false)", [id, c.org.id]));
  const r = isDraft ? await draftPublishNow(c.org.id, id) : await publishItemNow(c.org.id, id);
  if (!r.ok) return fail(r.error);
  const rep = await publishReport(c.org.id, id);
  return { ok: rep.ok, error: rep.error, note: rep.note, card: await itemCard(c.org.id, id) };
}
export async function cardItemToPlanAction(id: string, date: string, time: string): Promise<R> {
  const c = await requireWriter();
  const isDraft = !!(await one("select 1 from kz_content_items where id=$1 and org_id=$2 and coalesce((meta->>'draft')::boolean,false)", [id, c.org.id]));
  const r = isDraft ? await draftToPlan(c.org.id, id, date, time) : await rescheduleItem(c.org.id, id, date, time);
  return r.ok ? { ok: true, note: `В контент-плане на ${date} ${time}`, card: await itemCard(c.org.id, id) } : fail(r.error);
}
export async function cardItemDiscardAction(id: string): Promise<R> {
  const c = await requireWriter();
  await discardDraft(c.org.id, id);
  return { ok: true, note: "Черновик удалён", card: null };
}
export async function cardItemRegenAction(id: string): Promise<R> {
  const c = await requireWriter();
  await snapshot(c.org.id, id, "до пересоздания");
  const r = await regenDraft(c.org.id, id);
  return r.ok ? { ok: true, note: "Текст создан заново", card: await itemCard(c.org.id, id) } : fail(r.error);
}

export async function cardSaveFactoryAction(id: string, p: FactoryPatch): Promise<R> {
  const c = await requireWriter();
  const r = await saveFactoryPatch(c.org.id, id, p);
  return r.ok ? { ok: true, note: r.note, card: await one1(c.org.id, { t: "factory", id }) } : fail(r.error ?? "Не получилось");
}

export async function cardExtendPlanAction(factoryId: string, days: number): Promise<R> {
  const c = await requireWriter();
  const d = [7, 14, 30].includes(Number(days)) ? Number(days) : 7;
  const r = await buildPlan(c.org.id, factoryId, d);
  return r.ok ? { ok: true, note: `План продлён на ${d} дн.`, card: await one1(c.org.id, { t: "plan", id: factoryId }) } : fail(r.error);
}

export async function cardSetSourceAction(id: string, status: "active" | "paused"): Promise<R> {
  const c = await requireWriter();
  if (status !== "active" && status !== "paused") return fail("Неверный статус");
  await q("update kz_sources set status=$3 where id=$1 and org_id=$2", [id, c.org.id, status]);
  return { ok: true, card: await one1(c.org.id, { t: "sources" }) };
}

export async function cardSaveBrandAction(id: string, p: { name?: string; description?: string; audience?: string; tone?: string }): Promise<R> {
  const c = await requireWriter();
  const t = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : null);
  const name = t(p.name, 80);
  if (name !== null && name.length < 2) return fail("Название бренда — минимум 2 знака");
  const r = await q("update kz_brands set name=coalesce($3,name), description=coalesce($4,description), audience=coalesce($5,audience), tone=coalesce($6,tone) where id=$1 and org_id=$2 returning id",
    [id, c.org.id, name, t(p.description, 2000), t(p.audience, 1000), t(p.tone, 300)]);
  return r.length ? { ok: true, note: "Бренд сохранён", card: await one1(c.org.id, { t: "brand", id }) } : fail("Бренд не найден");
}

export async function cardSaveSignatureAction(id: string, signature: string): Promise<R> {
  const c = await requireWriter();
  await q("update kz_channels set signature=$3 where id=$1 and org_id=$2", [id, c.org.id, String(signature ?? "").replace(/\r/g, "").trim().slice(0, 500)]);
  return { ok: true, note: "Подпись сохранена", card: await one1(c.org.id, { t: "channels" }) };
}

export async function cardItemRestoreAction(id: string, versionId: string): Promise<R> {
  const c = await requireWriter();
  const r = await restoreVersion(c.org.id, id, versionId);
  return r.ok ? { ok: true, note: "Версия возвращена", card: await itemCard(c.org.id, id) } : fail(r.error);
}
/** Переписать выделенный в карточке фрагмент (платно, как правка текста). */
export async function cardItemRewriteFragmentAction(id: string, fragment: string, instruction: string): Promise<R> {
  const c = await requireWriter();
  const r = await rewriteFragment(c.org.id, id, String(fragment ?? "").slice(0, 3000), String(instruction ?? "").slice(0, 400));
  return r.ok ? { ok: true, note: r.text, card: await itemCard(c.org.id, id) } : fail(r.text);
}

/** Применить выбранный вариант заголовка, первой строки или поста. */
export async function cardPickVariantAction(itemId: string, what: string, text: string): Promise<R> {
  const c = await requireWriter();
  const { applyVariant } = await import("./extras");
  const r = await applyVariant(c.org.id, itemId, what === "post" || what === "hook" ? what : "headline", String(text ?? ""));
  return r.ok ? { ok: true, note: "Вариант применён" } : fail(r.error ?? "Не получилось");
}
