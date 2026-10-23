import { one, q } from "../db";
import { loadDrafts, type DraftItem } from "../drafts";
import { analytics } from "../engage";
import { groupSummaries } from "../competitors";
import { cleanSettings, type ContentSettings } from "../postsettings";
import { cleanKit, STYLES } from "../images";
import { KIND } from "../kinds";

/**
 * Карточки в чате: ассистент не только пишет текст, но и показывает сами посты, материалы, настройки и цифры.
 * В сообщении хранятся только ссылки на объекты (CardRef); свежие данные собираются при каждой загрузке чата, поэтому после правки в карточке
 * или на сайте карточка всегда показывает актуальное состояние.
 */
export type CardRef =
  | { t: "news"; ids: string[] } | { t: "item"; ids: string[] } | { t: "factory"; id: string } | { t: "sources" } | { t: "analytics"; days: number }
  | { t: "competitors" } | { t: "brand"; id: string } | { t: "plan"; id: string } | { t: "channels" };

export interface ChannelOpt { id: string; title: string; kind: string; on: boolean }
export interface NewsRow { id: string; title: string; text: string; source: string; sourceKind: string; url: string; at: string; liked: boolean; used: boolean; fit: number | null }
export type Card =
  | { t: "news"; items: NewsRow[]; factories: { id: string; name: string }[]; kinds: { id: string; label: string }[] }
  | { t: "item"; items: ItemRow[]; slot: string }
  | { t: "factory"; id: string; name: string; brand: string; status: string; autopublish: boolean; approval: string; images: boolean; channels: ChannelOpt[]; st: Pick<ContentSettings, "length" | "emoji" | "hashtags" | "cta" | "link">; planUntil: string | null; ideas: number; ready: number }
  | { t: "sources"; sources: { id: string; title: string; kind: string; status: string; error: string | null; news24: number }[] }
  | { t: "analytics"; days: number; posts: number; views: number; reactions: number; er: string; channels: { title: string; kind: string; posts: number; views: number }[]; top: { topic: string; kind: string; views: number; url: string | null }[] }
  | { t: "competitors"; groups: { id: string; name: string; platforms: string[]; members: number | null; perWeek: number; avgViews: number; lastPostAt: string | null; best: string | null }[] }
  | { t: "brand"; id: string; name: string; description: string; audience: string; tone: string; colors: string[]; extra: { label: string; value: string }[] }
  | { t: "plan"; id: string; name: string; until: string | null; items: { id: string; kind: string; topic: string; status: string; date: string | null }[] }
  | { t: "channels"; channels: { id: string; title: string; kind: string; brand: string; signature: string }[] };

export interface ItemRow { slides: string[]; id: string; kind: string; kindLabel: string; topic: string; body: string; status: string; draft: boolean; imageId: string | null; factoryId: string; factoryName: string; channels: ChannelOpt[]; date: string; time: string; published: { channel: string; url: string | null; ok: boolean; error: string | null }[] }

const UUID = /^[0-9a-f-]{36}$/i;
const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(String).filter((x) => UUID.test(x));

/** Ссылки на карточки из ответа модели: оставляем только известные типы и корректные id. */
export function cleanRefs(raw: unknown): CardRef[] {
  const out: CardRef[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const o = c as Record<string, unknown>;
    const t = String(o?.type ?? o?.t ?? "");
    if (t === "news" || t === "item") { const i = ids(o.ids ?? (o.id ? [o.id] : [])).slice(0, 5); if (i.length) out.push({ t, ids: i }); }
    else if ((t === "factory" || t === "brand" || t === "plan") && UUID.test(String(o.id ?? ""))) out.push({ t, id: String(o.id) });
    else if (t === "analytics") out.push({ t, days: [1, 7, 30, 90].includes(Number(o.days)) ? Number(o.days) : 7 });
    else if (t === "sources" || t === "competitors" || t === "channels") out.push({ t });
  }
  return out.slice(0, 6);
}

const dayStr = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function newsCard(orgId: string, idList: string[]): Promise<Card | null> {
  if (!idList.length) return null;
  const rows = await q<{ id: string; title: string; body: string; full_text: string | null; source: string; kind: string; url: string; published_at: string; status: string; fit_score: number | null }>(
    `select i.id,i.title,i.body,i.full_text,coalesce(nullif(s.title,''),s.ref) source,s.kind,i.url,i.published_at,i.status,i.fit_score from kz_feed_items i join kz_sources s on s.id=i.source_id where i.org_id=$1 and i.id = any($2::uuid[])`, [orgId, idList]);
  if (!rows.length) return null;
  const order = new Map(idList.map((x, i) => [x, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const [factories, kinds] = [await q<{ id: string; name: string }>("select id,name from kz_factories where org_id=$1 and status='active' order by name", [orgId]), ["post", "carousel", "story", "article", "seo", "poll"].map((id) => ({ id, label: KIND[id] ?? id }))];
  return { t: "news", factories, kinds, items: rows.map((r) => ({ id: r.id, title: r.title, text: (r.full_text || r.body || r.title).slice(0, 1400), source: r.source, sourceKind: r.kind, url: r.url.startsWith("manual:") ? "" : r.url, at: r.published_at, liked: r.status === "saved", used: r.status === "used", fit: r.fit_score })) };
}

async function itemCard(orgId: string, idList: string[]): Promise<Card | null> {
  if (!idList.length) return null;
  const drafts = await loadDrafts(orgId, idList);
  const draftIds = new Set(drafts.map((d) => d.id));
  const other = idList.filter((x) => !draftIds.has(x));
  const rest = other.length ? await q<{ id: string; kind: string; topic: string; body: string; status: string; image_id: string | null; factory_id: string; fname: string; planned_for: string | null }>(
    `select i.id,i.kind,i.topic,i.body,i.status,i.image_id,i.factory_id,f.name fname,i.planned_for from kz_content_items i left join kz_factories f on f.id=i.factory_id where i.org_id=$1 and i.id = any($2::uuid[])`, [orgId, other]) : [];
  const pubs = await q<{ item_id: string; channel: string; url: string | null; status: string; error: string | null }>(
    `select p.item_id,ch.title channel,p.external_url url,p.status,p.error from kz_publications p join kz_channels ch on ch.id=p.channel_id where p.org_id=$1 and p.item_id = any($2::uuid[]) order by p.created_at`, [orgId, idList]);
  const fn = await q<{ id: string; name: string }>("select id,name from kz_factories where org_id=$1", [orgId]);
  const slideRows = await q<{ id: string; item_id: string }>("select id,item_id from kz_assets where org_id=$1 and position>=0 and item_id = any($2::uuid[]) order by item_id,position", [orgId, idList]);
  const nameOf = (id: string | null) => fn.find((f) => f.id === id)?.name ?? "";
  const rows: ItemRow[] = [];
  const mk = (d: { id: string; kind: string; topic: string; body: string; status: string; image_id: string | null; factory_id: string }, draft: boolean, channels: ChannelOpt[], date: string | null): ItemRow => ({
    slides: slideRows.filter((x) => x.item_id === d.id).map((x) => x.id), id: d.id, kind: d.kind, kindLabel: KIND[d.kind] ?? d.kind, topic: d.topic, body: d.body, status: d.status, draft, imageId: d.image_id, factoryId: d.factory_id, factoryName: nameOf(d.factory_id), channels,
    date: date ?? new Date().toISOString().slice(0, 10), time: "10:00",
    published: pubs.filter((p) => p.item_id === d.id).map((p) => ({ channel: p.channel, url: p.url, ok: p.status === "published", error: p.error })),
  });
  for (const id of idList) {
    const d = drafts.find((x) => x.id === id) as DraftItem | undefined;
    if (d) { rows.push(mk(d, true, d.channels, null)); continue; }
    const r = rest.find((x) => x.id === id);
    if (r) rows.push(mk(r, false, [], dayStr(r.planned_for)));
  }
  return rows.length ? { t: "item", items: rows, slot: idList.join(",") } : null;
}

async function factoryCard(orgId: string, id: string): Promise<Card | null> {
  const f = await one<{ id: string; name: string; brand: string; brand_id: string; status: string; autopublish: boolean; approval: string; brief: unknown; channel_ids: string[]; plan_until: string | null; ideas: string; ready: string }>(
    `select f.id,f.name,b.name brand,f.brand_id,f.status,f.autopublish,f.approval,f.brief,f.channel_ids,
            (select max(planned_for) from kz_content_items i where i.factory_id=f.id and i.status in ('idea','approved','ready','scheduled')) plan_until,
            (select count(*) from kz_content_items i where i.factory_id=f.id and i.status='idea') ideas,(select count(*) from kz_content_items i where i.factory_id=f.id and i.status in ('ready','scheduled')) ready
       from kz_factories f join kz_brands b on b.id=f.brand_id where f.id=$1 and f.org_id=$2`, [id, orgId]);
  if (!f) return null;
  const chans = await q<{ id: string; title: string; kind: string }>("select id,title,kind from kz_channels where org_id=$1 and brand_id=$2 and status='active' order by created_at", [orgId, f.brand_id]);
  const st = cleanSettings(f.brief);
  return { t: "factory", id: f.id, name: f.name, brand: f.brand, status: f.status, autopublish: f.autopublish, approval: f.approval, images: !!(f.brief as { images?: boolean } | null)?.images,
    channels: chans.map((c) => ({ ...c, on: (f.channel_ids ?? []).includes(c.id) })), st: { length: st.length, emoji: st.emoji, hashtags: st.hashtags, cta: st.cta, link: st.link }, planUntil: dayStr(f.plan_until), ideas: Number(f.ideas), ready: Number(f.ready) };
}

export async function hydrateCards(orgId: string, refs: CardRef[] | undefined): Promise<Card[]> {
  const out: Card[] = [];
  for (const r of refs ?? []) {
    try {
      let c: Card | null = null;
      if (r.t === "news") c = await newsCard(orgId, r.ids);
      else if (r.t === "item") c = await itemCard(orgId, r.ids);
      else if (r.t === "factory") c = await factoryCard(orgId, r.id);
      else if (r.t === "sources") {
        const rows = await q<{ id: string; title: string; kind: string; status: string; last_error: string | null; n: string }>(
          `select s.id,s.title,s.kind,s.status,s.last_error,(select count(*) from kz_feed_items i where i.source_id=s.id and i.fetched_at > now() - interval '24 hours') n from kz_sources s where s.org_id=$1 and s.kind<>'manual' order by s.created_at limit 30`, [orgId]);
        c = rows.length ? { t: "sources", sources: rows.map((s) => ({ id: s.id, title: s.title, kind: s.kind, status: s.status, error: s.last_error, news24: Number(s.n) })) } : null;
      } else if (r.t === "analytics") {
        const a = await analytics(orgId, r.days as 7 | 30 | 0);
        const eng = Number(a.tot.likes) + Number(a.tot.comments) + Number(a.tot.reposts), views = Number(a.tot.views);
        c = { t: "analytics", days: r.days, posts: Number(a.tot.posts), views, reactions: eng, er: views ? ((eng / views) * 100).toFixed(1) : "0", channels: a.byChannel.slice(0, 5).map((x) => ({ title: x.title, kind: x.kind, posts: Number(x.posts), views: Number(x.views) })), top: a.top.slice(0, 4).map((x) => ({ topic: x.topic, kind: x.kind, views: x.views, url: x.url })) };
      } else if (r.t === "competitors") {
        const g = await groupSummaries(orgId);
        c = g.length ? { t: "competitors", groups: g.slice(0, 8).map((x) => ({ id: x.id, name: x.name, platforms: x.platforms.map((p) => p.kind), members: x.members, perWeek: x.perWeek, avgViews: x.avgViews, lastPostAt: x.lastPostAt, best: x.best?.body.slice(0, 160) ?? null })) } : null;
      } else if (r.t === "brand") {
        const b = await one<{ id: string; name: string; description: string; audience: string; tone: string; kit: unknown; rules: { forbidden?: string[]; competitors?: string[] } | null }>("select id,name,description,audience,tone,kit,rules from kz_brands where id=$1 and org_id=$2", [r.id, orgId]);
        c = b ? { t: "brand", id: b.id, name: b.name, description: b.description, audience: b.audience, tone: b.tone, colors: (cleanKit(b.kit).colors ?? []).map((x) => x.hex), extra: (() => {
          const k = cleanKit(b.kit), r = b.rules ?? {};
          return [["Стиль картинок", [k.style ? STYLES[k.style]?.label : "", k.styleNotes].filter(Boolean).join(". ")], ["Всегда на картинках", k.imageMust ?? ""], ["Не должно быть на картинках", k.imageNever ?? ""],
            ["Нельзя писать", (r.forbidden ?? []).join(", ")], ["Конкуренты", (r.competitors ?? []).join(", ")]].filter((x) => x[1]).map((x) => ({ label: x[0], value: x[1] }));
        })() } : null;
      } else if (r.t === "plan") {
        const f = await one<{ id: string; name: string }>("select id,name from kz_factories where id=$1 and org_id=$2", [r.id, orgId]);
        if (f) {
          const items = await q<{ id: string; kind: string; topic: string; status: string; planned_for: string | null }>(
            `select id,kind,topic,status,planned_for from kz_content_items where factory_id=$1 and org_id=$2 and status in ('idea','approved','generating','ready','scheduled') and not coalesce((meta->>'draft')::boolean,false) order by planned_for nulls last, created_at limit 8`, [f.id, orgId]);
          const until = await one<{ d: string | null }>("select max(planned_for) d from kz_content_items where factory_id=$1 and status in ('idea','approved','ready','scheduled')", [f.id]);
          c = { t: "plan", id: f.id, name: f.name, until: dayStr(until?.d ?? null), items: items.map((i) => ({ id: i.id, kind: i.kind, topic: i.topic, status: i.status, date: dayStr(i.planned_for) })) };
        }
      } else if (r.t === "channels") {
        const rows = await q<{ id: string; title: string; kind: string; brand: string; signature: string }>("select c.id,c.title,c.kind,b.name brand,c.signature from kz_channels c join kz_brands b on b.id=c.brand_id where c.org_id=$1 and c.status='active' order by c.created_at", [orgId]);
        c = rows.length ? { t: "channels", channels: rows } : null;
      }
      if (c) out.push(c);
    } catch { /* сбой одной карточки не должен ломать чат */ }
  }
  return out;
}
