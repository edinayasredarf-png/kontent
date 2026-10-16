"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx, requireWriter } from "../auth";
import { q } from "../db";
import { addManual, addSource, digest, itemToPlan, pollSource, recompute } from "./service";
import type { Kind } from "./fetchers";
import { feedWhere, parseFilter } from "./feed-query";
import { createFromNews, enrichItem, scoreNews, suggestKeywords, type KwSuggestion } from "./news";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const KINDS = ["site", "telegram", "vk", "news", "max"];
const back = () => revalidatePath("/app/monitor", "layout");

export async function addSourceAction(_: unknown, f: FormData) {
  const c = await requireWriter();
  const kind = s(f, "kind");
  if (!KINDS.includes(kind)) return { error: "Выберите тип источника" };
  const r = await addSource(c.org.id, c.org.plan, c.org.unlimited, kind as Kind, s(f, "value"));
  if (!r.error) back();
  return r;
}

export async function refreshSourceAction(f: FormData) {
  const c = await requireWriter();
  const own = await q("select 1 from kz_sources where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  if (own.length) await pollSource(s(f, "id"));
  back();
}

export async function refreshAllAction() {
  const c = await requireWriter();
  const ids = await q<{ id: string }>("select id from kz_sources where org_id=$1 and status='active' and kind<>'manual' order by last_fetched_at nulls first limit 12", [c.org.id]);
  for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map((x) => pollSource(x.id)));
  back();
}

export async function toggleSourceAction(f: FormData) {
  const c = await requireWriter();
  await q("update kz_sources set status=case when status='active' then 'paused' else 'active' end where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  back();
}

export async function deleteSourceAction(f: FormData) {
  const c = await requireWriter();
  await q("delete from kz_sources where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  back();
}

export async function addKeywordsAction(_: unknown, f: FormData) {
  const c = await requireWriter();
  const kind = s(f, "kind") === "exclude" ? "exclude" : "include";
  const words = s(f, "words").split(/[,\n;]/).map((w) => w.trim().toLowerCase().replace(/\s+/g, " ")).filter((w) => w.length >= 2 && w.length <= 60);
  if (!words.length) return { error: "Введите слова через запятую" };
  if (words.length > 50) return { error: "Не больше 50 слов за раз" };
  const total = Number((await q<{ n: string }>("select count(*) n from kz_keywords where org_id=$1", [c.org.id]))[0].n);
  if (total + words.length > 300) return { error: "Не больше 300 ключевых слов" };
  for (const w of [...new Set(words)]) await q("insert into kz_keywords(org_id,word,kind) values($1,$2,$3) on conflict do nothing", [c.org.id, w, kind]);
  await recompute(c.org.id);
  back();
  return {};
}

export async function deleteKeywordAction(f: FormData) {
  const c = await requireWriter();
  await q("delete from kz_keywords where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  await recompute(c.org.id);
  back();
}

export async function addManualAction(_: unknown, f: FormData) {
  const c = await requireWriter();
  const r = await addManual(c.org.id, s(f, "text"), s(f, "url"), s(f, "label"));
  if (!r.error) back();
  return r;
}

export async function setItemStatusAction(f: FormData) {
  const c = await requireWriter();
  const st = s(f, "status");
  if (!["new", "saved", "dismissed"].includes(st)) return;
  await q("update kz_feed_items set status=$3 where id=$1 and org_id=$2 and status<>'used'", [s(f, "id"), c.org.id, st]);
  back();
}

export async function itemToPlanAction(f: FormData) {
  const c = await requireWriter();
  const r = await itemToPlan(c.org.id, s(f, "id"), s(f, "factory"), s(f, "mode") === "write");
  back();
  const next = r.ok ? `/app/factories/${s(f, "factory")}` : `/app/monitor?err=${encodeURIComponent(r.error)}`;
  redirect(next);
}

export async function digestAction(_: unknown) {
  const c = await requireCtx();
  if (c.org.role === "viewer") return { error: "Недостаточно прав" };
  return digest(c.org.id);
}

/** Загрузить полный текст новости по ссылке (кнопка «Прочитать полностью»). */
export async function enrichItemAction(f: FormData) {
  const c = await requireWriter();
  const r = await enrichItem(c.org.id, s(f, "id"));
  back();
  redirect(r.ok ? `/app/monitor?note=${encodeURIComponent("Полный текст загружен")}` : `/app/monitor?err=${encodeURIComponent(r.note ?? "Не удалось загрузить текст")}`);
}

/** Подборка новостей под бренд: оценки сохраняются в ленте, дальше можно фильтровать «подходит мне». */
export async function scoreNewsAction(_: unknown, f: FormData): Promise<{ ok?: string; error?: string }> {
  const c = await requireWriter();
  const r = await scoreNews(c.org.id, s(f, "brand"));
  back();
  return r.ok ? { ok: `Оценено новостей: ${r.scored}. Включите фильтр «Подходит мне», чтобы увидеть лучшие.` } : { error: r.error };
}

export async function suggestKeywordsAction(brand: string): Promise<{ ok: true; s: KwSuggestion } | { ok: false; error: string }> {
  const c = await requireWriter();
  return suggestKeywords(c.org.id, String(brand ?? ""));
}

/** Создать материалы из новости: типы выбираются, режим «сразу» или «в план». */
export async function createFromNewsAction(f: FormData) {
  const c = await requireWriter();
  const factory = s(f, "factory");
  const r = await createFromNews(c.org.id, s(f, "id"), factory, f.getAll("kinds").map(String), s(f, "mode") !== "ideas", { angle: s(f, "angle"), postType: s(f, "postType") });
  back();
  if (!r.ok) redirect(`/app/monitor?err=${encodeURIComponent(r.error)}`);
  redirect(`/app/factories/${factory}?view=list&open=${r.ids[0]}${r.error ? `&err=${encodeURIComponent(r.error)}` : ""}${r.ids.length > 3 && s(f, "mode") !== "ideas" ? `&note=${encodeURIComponent("Первые три материала созданы, остальные пишутся в фоне.")}` : ""}#i-${r.ids[0]}`);
}

/** Сколько новых постов появилось в ленте с момента `since` с учётом фильтра. */
export async function countNewAction(params: Record<string, string | string[]>, since: string): Promise<{ count: number }> {
  const c = await requireCtx();
  if (Number.isNaN(Date.parse(since))) return { count: 0 };
  // в JS время с точностью до миллисекунды, в базе до микросекунды: +1 мс, чтобы самый свежий уже показанный пост не считался новым
  const w = feedWhere(c.org.id, parseFilter(params), new Date(Date.parse(since) + 1).toISOString());
  const r = await q<{ n: string }>(`select count(*) n from kz_feed_items i where ${w.sql}`, w.args);
  return { count: Number(r[0]?.n ?? 0) };
}

/** Кнопка «Обновить»: опрашивает источники (выбранные в фильтре или все активные) и считает, сколько новых постов появилось. */
export async function refreshFeedAction(params: Record<string, string | string[]>, since: string): Promise<{ count: number; polled: number; failed: number; added: number }> {
  const c = await requireCtx();
  const f = parseFilter(params);
  const src = await q<{ id: string }>(
    `select id from kz_sources where org_id=$1 and status='active' and kind<>'manual' and ($2::uuid[] = '{}' or id = any($2::uuid[])) order by last_fetched_at nulls first limit 12`, [c.org.id, f.src]);
  let added = 0, failed = 0;
  for (let i = 0; i < src.length; i += 4) {
    const rs = await Promise.all(src.slice(i, i + 4).map((x) => pollSource(x.id)));
    for (const r of rs) { added += r.added; if (r.error) failed++; }
  }
  const { count } = await countNewAction(params, since);
  return { count, polled: src.length, failed, added };
}
