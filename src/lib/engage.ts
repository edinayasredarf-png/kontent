import { one, q } from "./db";
import { open } from "./crypto";
import { call as vkCall } from "./publishing/vk";
import { chat } from "./ai";
import { aiReady } from "./ai";
import { PRICES, InsufficientFunds, charge, refund } from "./wallet";

/* ───────── разбор адресов опубликованных постов ───────── */
export function parseVkUrl(url: string): { owner: string; id: string } | null {
  const m = url.match(/vk\.com\/wall(-?\d+)_(\d+)/);
  return m ? { owner: m[1], id: m[2] } : null;
}
export function parseTgUrl(url: string): { user: string; id: string } | null {
  const m = url.match(/^https:\/\/t\.me\/([A-Za-z][A-Za-z0-9_]{3,31})\/(\d+)$/);
  return m ? { user: m[1], id: m[2] } : null;
}
/** «1.2K» → 1200, «3,4M» → 3 400 000, «845» → 845. */
export function parseCount(s: string): number {
  const m = s.trim().replace(",", ".").match(/^([\d.]+)\s*([KkMm]?)$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return Math.round(n * (m[2].toLowerCase() === "k" ? 1e3 : m[2].toLowerCase() === "m" ? 1e6 : 1));
}
export function parseTgViews(html: string): number | null {
  const m = html.match(/class="tgme_widget_message_views"[^>]*>([^<]+)</);
  return m ? parseCount(m[1]) : null;
}

const TG_BASE = () => (process.env.TG_WEB_BASE?.trim() || "https://t.me").replace(/\/+$/, "");

interface VkPost { id: number; owner_id: number; views?: { count: number }; likes?: { count: number }; comments?: { count: number }; reposts?: { count: number } }

/** Обновляет показатели опубликованных постов. Свежие — чаще (раз в час), старые — реже. Ошибка одного канала не мешает остальным. */
export async function collectStats(limit = 60): Promise<{ updated: number; errors: string[] }> {
  const rows = await q<{ id: string; org_id: string; url: string; kind: string; ch: string; credentials: unknown }>(
    `select p.id,p.org_id,p.external_url url,c.kind,c.id ch,c.credentials
       from kz_publications p join kz_channels c on c.id=p.channel_id left join kz_post_stats s on s.publication_id=p.id
      where p.status='published' and p.external_url is not null and p.published_at > now() - interval '30 days'
        and (s.fetched_at is null or s.fetched_at < now() - (case when p.published_at > now() - interval '3 days' then interval '1 hour'
                                                                   when p.published_at > now() - interval '14 days' then interval '6 hours' else interval '24 hours' end))
      order by s.fetched_at nulls first limit $1`, [limit]);
  const out = { updated: 0, errors: [] as string[] };
  const save = async (r: { id: string; org_id: string }, v: { views: number; likes: number; comments: number; reposts: number }) => {
    await q(`insert into kz_post_stats(publication_id,org_id,views,likes,comments,reposts,fetched_at) values($1,$2,$3,$4,$5,$6,now())
             on conflict(publication_id) do update set views=excluded.views,likes=excluded.likes,comments=excluded.comments,reposts=excluded.reposts,fetched_at=now()`,
      [r.id, r.org_id, v.views, v.likes, v.comments, v.reposts]);
    out.updated++;
  };

  // VK: до 100 постов одним запросом на канал
  const byCh = new Map<string, typeof rows>();
  for (const r of rows.filter((x) => x.kind === "vk")) byCh.set(r.ch, [...(byCh.get(r.ch) ?? []), r]);
  for (const list of byCh.values()) {
    try {
      const token = open(list[0].credentials).token;
      if (!token) continue;
      const ids = list.map((r) => ({ r, p: parseVkUrl(r.url) })).filter((x) => x.p);
      const res = await vkCall<{ items?: VkPost[] } | VkPost[]>(token, "wall.getById", { posts: ids.map((x) => `${x.p!.owner}_${x.p!.id}`).join(",") });
      const items = Array.isArray(res) ? res : res.items ?? [];
      for (const x of ids) {
        const it = items.find((i) => String(i.owner_id) === x.p!.owner && String(i.id) === x.p!.id);
        if (it) await save(x.r, { views: it.views?.count ?? 0, likes: it.likes?.count ?? 0, comments: it.comments?.count ?? 0, reposts: it.reposts?.count ?? 0 });
      }
    } catch (e) { out.errors.push(`vk: ${(e as Error).message}`.slice(0, 160)); }
  }

  // Telegram: просмотры из публичной страницы поста (бот-API просмотры каналов не отдаёт); реакции там недоступны
  const tg = rows.filter((x) => x.kind === "telegram");
  for (let i = 0; i < tg.length; i += 5) {
    await Promise.all(tg.slice(i, i + 5).map(async (r) => {
      const p = parseTgUrl(r.url);
      if (!p) return;
      try {
        const res = await fetch(`${TG_BASE()}/${p.user}/${p.id}?embed=1&mode=tme`, { signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; KontentBot/1.0)" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const views = parseTgViews(await res.text());
        if (views !== null) await save(r, { views, likes: 0, comments: 0, reposts: 0 });
      } catch (e) { out.errors.push(`tg ${p.user}: ${(e as Error).message}`.slice(0, 120)); }
    }));
  }
  return out;
}

/* ───────── входящие: комментарии VK ───────── */
interface VkComment { id: number; from_id: number; date: number; text?: string; deleted?: boolean }
interface VkProfiles { profiles?: { id: number; first_name: string; last_name: string }[]; groups?: { id: number; name: string }[] }

export async function collectComments(limitPosts = 25): Promise<{ added: number; errors: string[] }> {
  const posts = await q<{ id: string; org_id: string; url: string; ch: string; credentials: unknown }>(
    `select p.id,p.org_id,p.external_url url,c.id ch,c.credentials from kz_publications p join kz_channels c on c.id=p.channel_id
       left join kz_post_stats s on s.publication_id=p.id
      where p.status='published' and c.kind='vk' and p.published_at > now() - interval '14 days' and coalesce(s.comments,1) > 0
      order by p.published_at desc limit $1`, [limitPosts]);
  const out = { added: 0, errors: [] as string[] };
  for (const p of posts) {
    const v = parseVkUrl(p.url ?? "");
    if (!v) continue;
    try {
      const token = open(p.credentials).token;
      if (!token) continue;
      const r = await vkCall<{ items?: VkComment[] } & VkProfiles>(token, "wall.getComments", { owner_id: v.owner, post_id: v.id, count: "100", sort: "desc", extended: "1" });
      const names = new Map<number, string>();
      for (const u of r.profiles ?? []) names.set(u.id, `${u.first_name} ${u.last_name}`.trim());
      for (const g of r.groups ?? []) names.set(-g.id, g.name);
      for (const c of r.items ?? []) {
        if (c.deleted || !c.text?.trim() || c.from_id === Number(v.owner)) continue; // свои ответы от имени сообщества не копим
        const ins = await q(`insert into kz_comments(org_id,publication_id,channel_id,ext_id,author,body,posted_at) values($1,$2,$3,$4,$5,$6,to_timestamp($7)) on conflict(channel_id,ext_id) do nothing returning id`,
          [p.org_id, p.id, p.ch, `${v.owner}_${v.id}_${c.id}`, (names.get(c.from_id) ?? `id${c.from_id}`).slice(0, 80), c.text.slice(0, 4000), c.date]);
        out.added += ins.length;
      }
    } catch (e) { out.errors.push(`vk comments: ${(e as Error).message}`.slice(0, 160)); }
  }
  return out;
}

/** Ответ на комментарий VK от имени сообщества. Вызывается только по явному действию пользователя. */
export async function replyToComment(orgId: string, commentId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = text.trim();
  if (t.length < 1 || t.length > 4000) return { ok: false, error: "Ответ — от 1 до 4000 знаков" };
  const c = await one<{ ext_id: string; credentials: unknown; kind: string }>(
    "select cm.ext_id,ch.credentials,ch.kind from kz_comments cm join kz_channels ch on ch.id=cm.channel_id where cm.id=$1 and cm.org_id=$2", [commentId, orgId]);
  if (!c) return { ok: false, error: "Комментарий не найден" };
  if (c.kind !== "vk") return { ok: false, error: "Ответы из системы пока доступны только для VK" };
  const [owner, post, cid] = c.ext_id.split("_");
  const cred = open(c.credentials);
  try {
    await vkCall(cred.token, "wall.createComment", { owner_id: owner, post_id: post, message: t, reply_to_comment: cid, from_group: String(owner).replace("-", "") });
  } catch (e) { return { ok: false, error: (e as Error).message }; }
  await q("update kz_comments set status='done', reply=$3 where id=$1 and org_id=$2", [commentId, orgId, t]);
  return { ok: true };
}

/* ───────── аналитика ───────── */
export type Period = 7 | 30 | 0;
const since = (d: Period) => (d ? `now() - interval '${d} days'` : `'1970-01-01'::timestamptz`);

export async function analytics(orgId: string, days: Period) {
  const base = `from kz_publications p join kz_post_stats s on s.publication_id=p.id join kz_content_items i on i.id=p.item_id join kz_channels c on c.id=p.channel_id
                where p.org_id=$1 and p.status='published' and p.published_at >= ${since(days)}`;
  const [tot, byChannel, byKind, top, byHour] = await Promise.all([
    one<{ posts: string; views: string; likes: string; comments: string; reposts: string }>(`select count(*) posts,coalesce(sum(s.views),0) views,coalesce(sum(s.likes),0) likes,coalesce(sum(s.comments),0) comments,coalesce(sum(s.reposts),0) reposts ${base}`, [orgId]),
    q<{ kind: string; title: string; posts: string; views: string; eng: string }>(`select c.kind,c.title,count(*) posts,coalesce(sum(s.views),0) views,coalesce(sum(s.likes+s.comments+s.reposts),0) eng ${base} group by c.kind,c.title order by views desc`, [orgId]),
    q<{ kind: string; posts: string; views: string; avg: string; eng: string }>(`select i.kind,count(*) posts,coalesce(sum(s.views),0) views,round(coalesce(avg(s.views),0)) avg,coalesce(sum(s.likes+s.comments+s.reposts),0) eng ${base} group by i.kind order by avg desc`, [orgId]),
    q<{ topic: string; kind: string; channel: string; url: string | null; published_at: string; views: number; likes: number; comments: number; reposts: number }>(
      `select i.topic,i.kind,c.title channel,p.external_url url,p.published_at,s.views,s.likes,s.comments,s.reposts ${base} order by s.views desc, (s.likes+s.comments+s.reposts) desc limit 10`, [orgId]),
    q<{ hour: number; posts: string; avg: string }>(`select extract(hour from p.published_at at time zone 'Europe/Moscow')::int as hour,count(*) posts,round(avg(s.views)) avg ${base} group by 1 order by 1`, [orgId]),
  ]);
  return { tot: tot!, byChannel, byKind, top, byHour };
}

export async function recommendations(orgId: string, days: Period): Promise<{ text?: string; error?: string }> {
  if (!aiReady()) return { error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const a = await analytics(orgId, days);
  if (Number(a.tot.posts) < 3) return { error: "Для рекомендаций нужно хотя бы 3 опубликованных поста со статистикой. Дайте постам время набрать просмотры." };
  const worst = await q<{ topic: string; kind: string; views: number }>(
    `select i.topic,i.kind,s.views from kz_publications p join kz_post_stats s on s.publication_id=p.id join kz_content_items i on i.id=p.item_id
      where p.org_id=$1 and p.status='published' and p.published_at >= ${since(days)} order by s.views asc limit 5`, [orgId]);
  const cost = PRICES.digest;
  try { await charge(orgId, cost, "Рекомендации по аналитике"); }
  catch (e) { if (e instanceof InsufficientFunds) return { error: "Недостаточно средств на балансе" }; throw e; }
  const data = [
    `Итого: постов ${a.tot.posts}, просмотров ${a.tot.views}, реакций ${Number(a.tot.likes) + Number(a.tot.comments) + Number(a.tot.reposts)}`,
    `По форматам (в среднем просмотров на пост): ${a.byKind.map((k) => `${k.kind} ${k.avg} (${k.posts} шт.)`).join("; ")}`,
    `По часам публикации (МСК, средние просмотры): ${a.byHour.map((h) => `${h.hour}:00 → ${h.avg} (${h.posts})`).join("; ")}`,
    `Лучшие посты:\n${a.top.slice(0, 5).map((t) => `- «${t.topic}» [${t.kind}, ${t.channel}] ${t.views} просм., ${t.likes + t.comments + t.reposts} реакций`).join("\n")}`,
    `Слабые посты:\n${worst.map((t) => `- «${t.topic}» [${t.kind}] ${t.views} просм.`).join("\n")}`,
  ].join("\n");
  try {
    const text = await chat("analyst", "Ты аналитик контента для соцсетей. Пиши по-русски, конкретно, без воды. Опирайся только на переданные данные и честно говори, если данных мало для вывода.",
      `${data}\n\nДай: 1) что работает лучше всего и почему (по данным); 2) что не работает; 3) 5 конкретных рекомендаций на следующую неделю (темы, форматы, время публикации).`, { maxTokens: 1500, temperature: 0.3, timeoutMs: 55_000 });
    return { text };
  } catch (e) { await refund(orgId, cost, "ошибка рекомендаций"); return { error: `Не получилось, деньги возвращены: ${(e as Error).message}` }; }
}

/* ───────── самообучение: выводы из статистики прошлых публикаций бренда ───────── */
/**
 * Короткая выжимка для промпта: какие темы и форматы набрали больше всего просмотров и какие провалились.
 * Работает только когда накопилось хотя бы 6 постов со статистикой — иначе выводы случайны. Пустая строка — данных мало.
 */
export async function learnings(orgId: string, brandId: string): Promise<string> {
  const rows = await q<{ topic: string; hook: string; kind: string; views: number; react: number }>(
    `select i.topic,i.hook,i.kind,s.views,(s.likes+s.comments+s.reposts) react
       from kz_publications p join kz_post_stats s on s.publication_id=p.id join kz_content_items i on i.id=p.item_id
      where p.org_id=$1 and i.brand_id=$2 and p.status='published' and p.published_at > now() - interval '120 days' and s.views > 0
      order by s.views desc limit 60`, [orgId, brandId]);
  if (rows.length < 6) return "";
  const best = rows.slice(0, 4), worst = rows.slice(-3);
  const byKind = new Map<string, number[]>();
  for (const r of rows) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r.views]);
  const kinds = [...byKind.entries()].filter(([, v]) => v.length >= 2).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)] as const).sort((a, b) => b[1] - a[1]);
  const t = (r: { topic: string; hook: string }) => `«${r.topic.slice(0, 90)}»${r.hook ? ` (хук: ${r.hook.slice(0, 80)})` : ""}`;
  return [
    "Что показала статистика этого бренда (учитывай как подсказку, не копируй дословно и не повторяй темы):",
    `Лучше всего сработало:\n${best.map((r) => `- ${t(r)} — ${r.views} просм.`).join("\n")}`,
    `Хуже всего:\n${worst.map((r) => `- ${t(r)} — ${r.views} просм.`).join("\n")}`,
    kinds.length > 1 ? `Средние просмотры по форматам: ${kinds.map(([k, v]) => `${k} ${v}`).join(", ")}.` : "",
  ].filter(Boolean).join("\n");
}

/* ───────── подписчики каналов ───────── */
const TG_API = () => (process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org").replace(/\/+$/, "");

/** Раз в сутки записывает число подписчиков каждого активного канала Telegram и VK — из этого строится рост аудитории. */
export async function collectMembers(limit = 30): Promise<{ saved: number; errors: string[] }> {
  const chans = await q<{ id: string; org_id: string; kind: string; credentials: unknown }>(
    `select c.id,c.org_id,c.kind,c.credentials from kz_channels c
      where c.status='active' and c.kind in ('telegram','vk') and not exists (select 1 from kz_channel_stats s where s.channel_id=c.id and s.day=current_date)
        and not exists (select 1 from kz_orgs o where o.id=c.org_id and o.suspended)
      limit $1`, [limit]);
  const out = { saved: 0, errors: [] as string[] };
  for (const c of chans) {
    try {
      const cred = open(c.credentials);
      let n: number | null = null;
      if (c.kind === "telegram") {
        const res = await fetch(`${TG_API()}/bot${cred.token}/getChatMemberCount?chat_id=${encodeURIComponent((cred.target ?? "").trim())}`, { signal: AbortSignal.timeout(12_000) });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: number };
        if (j.ok && typeof j.result === "number") n = j.result;
      } else {
        const id = (cred.target ?? "").trim().replace(/^-/, "");
        const r = await vkCall<{ groups?: { members_count?: number }[] } | { members_count?: number }[]>(cred.token, "groups.getById", { group_id: id, fields: "members_count" });
        const g = Array.isArray(r) ? r[0] : r.groups?.[0];
        if (typeof g?.members_count === "number") n = g.members_count;
      }
      if (n == null) { out.errors.push(`${c.kind}: число подписчиков недоступно`); continue; }
      await q("insert into kz_channel_stats(channel_id,org_id,day,members) values($1,$2,current_date,$3) on conflict(channel_id,day) do update set members=excluded.members", [c.id, c.org_id, n]);
      out.saved++;
    } catch (e) { out.errors.push(`${c.kind}: ${(e as Error).message}`.slice(0, 140)); }
  }
  return out;
}

/** Подписчики по каналам: сейчас, 7 и 30 дней назад и ряд по дням для графика. */
export async function membersReport(orgId: string) {
  const rows = await q<{ id: string; title: string; kind: string; now: number | null; d7: number | null; d30: number | null }>(
    `select c.id,c.title,c.kind,
            (select members from kz_channel_stats where channel_id=c.id order by day desc limit 1) as now,
            (select members from kz_channel_stats where channel_id=c.id and day <= current_date - 7 order by day desc limit 1) as d7,
            (select members from kz_channel_stats where channel_id=c.id and day <= current_date - 30 order by day desc limit 1) as d30
       from kz_channels c where c.org_id=$1 and c.status='active' and c.kind in ('telegram','vk') order by c.created_at`, [orgId]);
  const series = await q<{ channel_id: string; day: string; members: number }>(
    "select channel_id,to_char(day,'DD.MM') as day,members from kz_channel_stats where org_id=$1 and day > current_date - 60 order by day", [orgId]);
  return rows.filter((r) => r.now != null).map((r) => ({ ...r, series: series.filter((s) => s.channel_id === r.id) }));
}
