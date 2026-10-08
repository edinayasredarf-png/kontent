import { one, q, tx } from "../db";
import { fetchItems, resolveSource, type Kind } from "./fetchers";
import { matchItem, type Kw } from "./keywords";
import { sha, type Item } from "./parse";
import { aiReady, genDigest, genIdea } from "../ai";
import { PRICES, InsufficientFunds, charge, refund } from "../wallet";
import { loadFactory, buildItem, type Result } from "../pipeline";
import { PLANS, type PlanKey } from "../plans";

export const loadKeywords = (orgId: string) => q<Kw & { id: string }>("select id,word,kind from kz_keywords where org_id=$1 order by kind,word", [orgId]);

/** Записывает новые посты источника (повторные — игнорирует) и считает совпадения с ключевыми словами. */
async function storeItems(orgId: string, sourceId: string, items: Item[]): Promise<number> {
  if (!items.length) return 0;
  const kws = await loadKeywords(orgId);
  let added = 0;
  for (const it of items) {
    const m = matchItem(it.title, it.body, kws);
    const r = await q(
      `insert into kz_feed_items(org_id,source_id,ext_id,url,title,body,published_at,matched,score,excluded)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(source_id,ext_id) do nothing returning id`,
      [orgId, sourceId, it.extId, it.url, it.title, it.body, it.publishedAt, m.matched, m.score, m.excluded]);
    added += r.length;
  }
  return added;
}

export async function addSource(orgId: string, plan: PlanKey, unlimited: boolean, kind: Kind, input: string): Promise<{ error?: string }> {
  const lim = unlimited ? null : PLANS[plan].sources;
  const n = Number((await one<{ n: string }>("select count(*) n from kz_sources where org_id=$1 and kind<>'manual'", [orgId]))!.n);
  if (lim !== null && n >= lim) return { error: `Тариф «${PLANS[plan].name}»: максимум источников — ${lim}. Повысьте тариф.` };
  let r;
  try { r = await resolveSource(kind, input); } catch (e) { return { error: (e as Error).message }; }
  const row = await one<{ id: string }>(
    `insert into kz_sources(org_id,kind,ref,title,config) values($1,$2,$3,$4,$5) on conflict(org_id,kind,ref) do nothing returning id`,
    [orgId, kind, r.ref, r.title, JSON.stringify(r.config)]);
  if (!row) return { error: "Такой источник уже добавлен" };
  await pollSource(row.id);
  return {};
}

/** Опрос одного источника. Ошибка пишется в источник, а не пробрасывается: один сломанный сайт не должен ронять проход. */
export async function pollSource(id: string): Promise<{ added: number; error?: string }> {
  const s = await one<{ id: string; org_id: string; kind: Kind; ref: string; config: Record<string, unknown> }>("select id,org_id,kind,ref,config from kz_sources where id=$1", [id]);
  if (!s || s.kind === "manual") return { added: 0 };
  try {
    const added = await storeItems(s.org_id, s.id, await fetchItems(s.kind, s.ref, s.config));
    await q("update kz_sources set last_fetched_at=now(), last_error=null where id=$1", [id]);
    return { added };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await q("update kz_sources set last_fetched_at=now(), last_error=$2 where id=$1", [id, msg]);
    return { added: 0, error: msg };
  }
}

/** Проход воркера: самые давно не опрашивавшиеся активные источники всех организаций. */
export async function pollDue(limit = 8, intervalMin = 60): Promise<{ polled: number; added: number; failed: number }> {
  const due = await q<{ id: string }>(
    `select id from kz_sources where status='active' and kind<>'manual' and (last_fetched_at is null or last_fetched_at < now() - ($2||' minutes')::interval)
      order by last_fetched_at nulls first limit $1`, [limit, String(intervalMin)]);
  const out = { polled: 0, added: 0, failed: 0 };
  for (let i = 0; i < due.length; i += 3) {
    const rs = await Promise.all(due.slice(i, i + 3).map((d) => pollSource(d.id)));
    for (const r of rs) { out.polled++; out.added += r.added; if (r.error) out.failed++; }
  }
  // неразобранное старше 45 дней не копим; сохранённое и использованное остаётся
  await q("delete from kz_feed_items where status in ('new','dismissed') and fetched_at < now() - interval '45 days'");
  return out;
}

/** После смены ключевых слов пересчитываем совпадения у всех постов организации. */
export async function recompute(orgId: string) {
  const kws = await loadKeywords(orgId);
  const items = await q<{ id: string; title: string; body: string }>("select id,title,body from kz_feed_items where org_id=$1 order by published_at desc limit 5000", [orgId]);
  for (let i = 0; i < items.length; i += 500) {
    const batch = items.slice(i, i + 500).map((it) => ({ id: it.id, ...matchItem(it.title, it.body, kws) }));
    await q(
      `update kz_feed_items f set matched=array(select jsonb_array_elements_text(r.matched)), score=r.score, excluded=r.excluded
         from jsonb_to_recordset($2::jsonb) as r(id uuid, matched jsonb, score int, excluded boolean) where f.id=r.id and f.org_id=$1`,
      [orgId, JSON.stringify(batch)]);
  }
}

/** Пост, которого нет в открытых источниях (MAX, закрытый канал, письмо): вставляем вручную. */
export async function addManual(orgId: string, text: string, url: string, label: string): Promise<{ error?: string }> {
  text = text.trim();
  if (text.length < 10) return { error: "Вставьте текст поста (минимум 10 знаков)" };
  if (url) { try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { return { error: "Ссылка должна начинаться с http:// или https://" }; } }
  const src = (await one<{ id: string }>(
    `insert into kz_sources(org_id,kind,ref,title) values($1,'manual','manual','Вручную (MAX и др.)')
     on conflict(org_id,kind,ref) do update set title=kz_sources.title returning id`, [orgId]))!;
  const first = text.replace(/\s+/g, " ");
  const link = url || `manual:${sha(text)}`;
  const n = await storeItems(orgId, src.id, [{
    extId: sha(link + text.slice(0, 200)), url: link, title: first.length > 140 ? first.slice(0, 139) + "…" : first,
    body: text.slice(0, 4000), publishedAt: new Date(),
  }]);
  if (label.trim()) await q("update kz_sources set title=$2 where id=$1", [src.id, `Вручную: ${label.trim().slice(0, 60)}`]);
  return n ? {} : { error: "Такой пост уже добавлен" };
}

/** Из поста — идея в контент-плане завода (и, если нужно, сразу текст). Деньги списываются за идею; при сбое возвращаются. */
export async function itemToPlan(orgId: string, itemId: string, factoryId: string, writeNow: boolean): Promise<Result & { contentItemId?: string }> {
  const it = await one<{ id: string; title: string; body: string; url: string; status: string; source: string }>(
    `select i.id,i.title,i.body,i.url,i.status,s.title source from kz_feed_items i join kz_sources s on s.id=i.source_id where i.id=$1 and i.org_id=$2`, [itemId, orgId]);
  if (!it) return { ok: false, error: "Пост не найден" };
  if (it.status === "used") return { ok: false, error: "Из этого поста уже сделана идея" };
  const fac = await loadFactory(orgId, factoryId);
  if (!fac) return { ok: false, error: "Выберите завод" };
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const cost = PRICES.idea;
  try { await charge(orgId, cost, `Идея из поста: ${it.title.slice(0, 50)}`, it.id); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  let idea;
  try {
    idea = await genIdea({ name: fac.brand_name, description: fac.description, audience: fac.audience, tone: fac.tone, forbidden: fac.rules?.forbidden ?? [] },
      fac.product, fac.niche, fac.formats, { title: it.title, body: it.body, url: it.url });
  } catch (e) { await refund(orgId, cost, "ошибка генерации идеи", it.id); return { ok: false, error: `Не удалось придумать идею, деньги возвращены: ${(e as Error).message}` }; }
  const last = await one<{ d: string | null }>("select to_char(max(planned_for),'YYYY-MM-DD') d from kz_content_items where factory_id=$1", [factoryId]);
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + 1);
  if (last?.d && new Date(last.d + "T12:00:00") >= d) { d.setTime(new Date(last.d + "T12:00:00").getTime()); d.setDate(d.getDate() + 1); }
  const meta = JSON.stringify({ source: { title: it.title, body: it.body.slice(0, 3000), url: it.url, name: it.source } });
  const id = await tx(async (run) => {
    const [c] = await run<{ id: string }>(
      `insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,planned_for,status,meta) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [orgId, factoryId, fac.brand_id, idea.kind, idea.topic, idea.hook, d.toISOString().slice(0, 10), writeNow ? "approved" : "idea", meta]);
    await run("update kz_feed_items set status='used', content_item_id=$2 where id=$1", [itemId, c.id]);
    return c.id;
  });
  if (!writeNow) return { ok: true, contentItemId: id };
  const r = await buildItem(orgId, id);
  return r.ok ? { ok: true, contentItemId: id } : { ok: false, error: `Идея добавлена в план, но текст не написан: ${r.error}`, contentItemId: id };
}

/** Сводка по самым релевантным постам недели. */
export async function digest(orgId: string): Promise<{ text?: string; error?: string }> {
  if (!aiReady()) return { error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const items = await q<{ title: string; body: string; source: string }>(
    `select i.title,i.body,s.title source from kz_feed_items i join kz_sources s on s.id=i.source_id
      where i.org_id=$1 and not i.excluded and i.status<>'dismissed' and i.published_at > now() - interval '7 days'
      order by i.score desc, i.published_at desc limit 30`, [orgId]);
  if (items.length < 3) return { error: "Для сводки нужно хотя бы 3 поста за неделю. Добавьте источники или обновите ленту." };
  const cost = PRICES.digest;
  try { await charge(orgId, cost, "Сводка трендов по источникам"); }
  catch (e) { if (e instanceof InsufficientFunds) return { error: "Недостаточно средств на балансе" }; throw e; }
  try { return { text: await genDigest(items, (await loadKeywords(orgId)).filter((k) => k.kind === "include").map((k) => k.word)) }; }
  catch (e) { await refund(orgId, cost, "ошибка сводки"); return { error: `Сводка не получилась, деньги возвращены: ${(e as Error).message}` }; }
}
