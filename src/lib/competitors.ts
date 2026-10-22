import { parse as parseHtml } from "node-html-parser";
import { one, q, tx } from "./db";
import { aiReady, chat } from "./ai";
import { parseCount } from "./engage";
import { allocateDates } from "./plan";
import { safeFetchText } from "./safefetch";
import { vkServiceError } from "./vk-service";
import { fetchItems, resolveSource } from "./monitor/fetchers";
import { InsufficientFunds, PRICES, charge, refund } from "./wallet";

export type CKind = "telegram" | "vk" | "site";
export const MAX_COMPETITORS = 10;
const TG = /^[A-Za-z][A-Za-z0-9_]{3,31}$/, VKD = /^[A-Za-z0-9_.]{2,50}$/;

export interface CPost { ext: string; url: string; body: string; views: number; likes: number; at: Date }
export interface CFetch { title: string; members: number | null; posts: CPost[] }

/** Приводит ввод («@name», ссылка t.me/…, vk.com/…) к имени публичного источника. Закрытые и несуществующие отклоняются при первой загрузке. */
export function normalizeRef(kind: CKind, input: string): string {
  const v = input.trim();
  if (kind === "telegram") {
    const name = v.replace(/^https?:\/\/(t\.me|telegram\.me)\/(s\/)?/i, "").replace(/^@/, "").split(/[/?#]/)[0];
    if (!TG.test(name)) throw new Error("Нужен username публичного канала: @name или https://t.me/name");
    return name.toLowerCase();
  }
  if (kind === "site") {
    let u: URL;
    try { u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { throw new Error("Нужен адрес сайта: example.ru или https://example.ru/blog"); }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || u.username || u.password) throw new Error("Нужен адрес сайта: example.ru или https://example.ru/blog");
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`.slice(0, 300);
  }
  const d = v.replace(/^https?:\/\/(m\.)?vk\.(com|ru)\//i, "").split(/[/?#]/)[0];
  if (!VKD.test(d)) throw new Error("Нужна ссылка на сообщество: vk.com/name или vk.com/club123");
  return d.toLowerCase();
}

/** Публичная страница канала t.me/s/<name>: заголовок, число подписчиков и последние посты с просмотрами. */
export function parseTelegramChannel(html: string, name: string): CFetch {
  const root = parseHtml(html);
  const title = root.querySelector(".tgme_channel_info_header_title")?.text.trim() || `@${name}`;
  let members: number | null = null;
  for (const c of root.querySelectorAll(".tgme_channel_info_counter")) {
    if (/subscriber|подписчик/i.test(c.querySelector(".counter_type")?.text ?? "")) { const n = parseCount(c.querySelector(".counter_value")?.text ?? ""); if (n) members = n; }
  }
  const posts: CPost[] = [];
  for (const p of root.querySelectorAll(".tgme_widget_message_wrap")) {
    const body = p.querySelector(".tgme_widget_message_text")?.text.replace(/\s+/g, " ").trim();
    const href = p.querySelector(".tgme_widget_message_date")?.getAttribute("href");
    if (!body || !href) continue;
    const dt = Date.parse(p.querySelector(".tgme_widget_message_date time")?.getAttribute("datetime") ?? "");
    posts.push({ ext: href, url: href, body: body.slice(0, 4000), views: parseCount(p.querySelector(".tgme_widget_message_views")?.text ?? "0"), likes: 0, at: Number.isNaN(dt) ? new Date() : new Date(dt) });
  }
  return { title, members, posts };
}

/** Текст поста с сохранением абзацев; упоминания VK «[club123|Название]» превращаются в обычное название. */
export const cleanPostText = (t: string) => t.replace(/\[(?:club|public|id)\d+\|([^\]]+)\]/g, "$1").replace(/\r/g, "").replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const VK_BASE = () => (process.env.VK_API_BASE?.trim() || "https://api.vk.com").replace(/\/+$/, "");
async function vk<T>(token: string, method: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${VK_BASE()}/method/${method}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15_000), body: new URLSearchParams({ ...params, access_token: token, v: "5.199" }) });
  const j = (await res.json().catch(() => ({}))) as { response?: T; error?: { error_code: number; error_msg: string } };
  if (j.error) throw new Error(vkServiceError(j.error.error_code, j.error.error_msg));
  return j.response as T;
}

export async function fetchCompetitor(kind: CKind, ref: string): Promise<CFetch> {
  if (kind === "telegram") {
    const r = await safeFetchText(`${(process.env.TG_WEB_BASE?.trim() || "https://t.me").replace(/\/+$/, "")}/s/${encodeURIComponent(ref)}`);
    const f = parseTelegramChannel(r.text, ref);
    if (!f.posts.length) throw new Error("Канал не найден, закрыт или в нём нет текстовых постов");
    return f;
  }
  if (kind === "site") {
    // сайт: лента RSS, если она есть, иначе заголовки материалов со страницы; просмотров и подписчиков у сайта нет
    const r = await resolveSource("site", ref);
    const items = (await fetchItems("site", r.ref, r.config)).slice(0, 40);
    if (!items.length) throw new Error("На сайте не нашли материалов: нужна страница со списком новостей или статей либо лента RSS");
    return { title: r.title, members: null, posts: items.map((i) => ({ ext: i.url, url: i.url, body: (i.body && i.body.length > i.title.length ? i.body : i.title).slice(0, 4000), views: 0, likes: 0, at: i.publishedAt })) };
  }
  const token = process.env.VK_SERVICE_TOKEN?.trim();
  if (!token) throw new Error("Для анализа VK на сервере не задан ключ VK_SERVICE_TOKEN (сервисный ключ приложения VK)");
  const [wall, grp] = await Promise.all([
    vk<{ items?: { id: number; owner_id: number; date: number; text?: string; copy_history?: { text?: string }[]; views?: { count: number }; likes?: { count: number } }[] }>(token, "wall.get", { domain: ref, count: "40", filter: "owner" }),
    vk<{ groups?: { name: string; members_count?: number }[] } | { name: string; members_count?: number }[]>(token, "groups.getById", { group_id: ref, fields: "members_count" }).catch(() => null),
  ]);
  const g = Array.isArray(grp) ? grp[0] : grp?.groups?.[0];
  const posts = (wall.items ?? []).map((p) => ({ ...p, text: p.text?.trim() ? p.text : p.copy_history?.[0]?.text })).filter((p) => p.text?.trim()).map((p) => {
    const url = `https://vk.com/wall${p.owner_id}_${p.id}`;
    return { ext: url, url, body: cleanPostText(p.text!).slice(0, 8000), views: p.views?.count ?? 0, likes: p.likes?.count ?? 0, at: new Date(p.date * 1000) };
  });
  if (!posts.length) throw new Error("Сообщество не найдено, закрыто или без текстовых записей");
  return { title: g?.name ?? `VK ${ref}`, members: g?.members_count ?? null, posts };
}

/** Загружает посты и обновляет карточку конкурента. Ошибка сохраняется в last_error и не роняет остальных. */
export async function refreshCompetitor(id: string): Promise<{ ok: true; posts: number } | { ok: false; error: string }> {
  const c = await one<{ id: string; kind: CKind; ref: string }>("select id,kind,ref from kz_competitors where id=$1", [id]);
  if (!c) return { ok: false, error: "Не найден" };
  try {
    const f = await fetchCompetitor(c.kind, c.ref);
    await tx(async (run) => {
      for (const p of f.posts) await run(
        `insert into kz_competitor_posts(competitor_id,ext_id,url,body,views,likes,posted_at,fetched_at) values($1,$2,$3,$4,$5,$6,$7,now())
         on conflict(competitor_id,ext_id) do update set views=excluded.views,likes=excluded.likes,body=excluded.body,fetched_at=now()`, [c.id, p.ext, p.url, p.body, p.views, p.likes, p.at.toISOString()]);
      await run("update kz_competitors set title=$2, members=coalesce($3,members), last_fetched_at=now(), last_error=null where id=$1", [c.id, f.title.slice(0, 120), f.members]);
    });
    return { ok: true, posts: f.posts.length };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 400);
    await q("update kz_competitors set last_error=$2, last_fetched_at=now() where id=$1", [c.id, msg]);
    return { ok: false, error: msg };
  }
}

export const MAX_PLATFORMS = 6;
export const KIND_NAME: Record<CKind, string> = { telegram: "Telegram", vk: "VK", site: "Сайт" };

/** Добавляет площадку к конкуренту (группе) и сразу загружает её посты. При сбое загрузки площадка не сохраняется. */
export async function addPlatform(orgId: string, groupId: string, kind: string, input: string): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  if (kind !== "telegram" && kind !== "vk" && kind !== "site") return { ok: false, error: "Выберите площадку: Telegram, VK или сайт" };
  let ref: string;
  try { ref = normalizeRef(kind, input); } catch (e) { return { ok: false, error: (e as Error).message }; }
  if (!(await one("select 1 from kz_competitor_groups where id=$1 and org_id=$2", [groupId, orgId]))) return { ok: false, error: "Конкурент не найден" };
  const n = await one<{ n: string }>("select count(*) n from kz_competitors where group_id=$1", [groupId]);
  if (Number(n!.n) >= MAX_PLATFORMS) return { ok: false, error: `У одного конкурента не больше ${MAX_PLATFORMS} площадок` };
  const row = await one<{ id: string }>("insert into kz_competitors(org_id,group_id,kind,ref,title) values($1,$2,$3,$4,$5) on conflict(org_id,kind,ref) do nothing returning id", [orgId, groupId, kind, ref, ref]);
  if (!row) return { ok: false, error: "Эта площадка уже добавлена (у этого или другого конкурента)" };
  const r = await refreshCompetitor(row.id);
  if (!r.ok) { await q("delete from kz_competitors where id=$1", [row.id]); return { ok: false, error: r.error }; }
  const t = await one<{ title: string }>("select title from kz_competitors where id=$1", [row.id]);
  return { ok: true, title: t?.title ?? ref };
}

/** Новый конкурент: группа с именем и первой площадкой. Имя не задано — берём название площадки. Не получилось загрузить — группа не создаётся. */
export async function addCompetitor(orgId: string, brandId: string | null, kind: string, input: string, name = ""): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (brandId && !(await one("select 1 from kz_brands where id=$1 and org_id=$2", [brandId, orgId]))) return { ok: false, error: "Бренд не найден" };
  const n = await one<{ n: string }>("select count(*) n from kz_competitor_groups where org_id=$1", [orgId]);
  if (Number(n!.n) >= MAX_COMPETITORS) return { ok: false, error: `Не больше ${MAX_COMPETITORS} конкурентов — удалите ненужных` };
  const g = await one<{ id: string }>("insert into kz_competitor_groups(org_id,brand_id,name) values($1,$2,$3) returning id", [orgId, brandId, name.trim().slice(0, 80) || "Без названия"]);
  const r = await addPlatform(orgId, g!.id, kind, input);
  if (!r.ok) { await q("delete from kz_competitor_groups where id=$1", [g!.id]); return r; }
  if (!name.trim()) await q("update kz_competitor_groups set name=$2 where id=$1", [g!.id, r.title.slice(0, 80)]);
  return { ok: true, id: g!.id };
}

/** Воркер: раз в 12 часов обновляем всех конкурентов, по несколько за проход. */
export async function collectCompetitors(limit = 6): Promise<{ updated: number; errors: string[] }> {
  const rows = await q<{ id: string }>(
    `select c.id from kz_competitors c where (c.last_fetched_at is null or c.last_fetched_at < now() - interval '12 hours') and not exists (select 1 from kz_orgs o where o.id=c.org_id and o.suspended)
      order by c.last_fetched_at nulls first limit $1`, [limit]);
  const out = { updated: 0, errors: [] as string[] };
  for (const r of rows) { const x = await refreshCompetitor(r.id); if (x.ok) out.updated++; else out.errors.push(`competitor: ${x.error}`.slice(0, 140)); }
  return out;
}

export interface CompStat { gname: string; id: string; group_id: string; kind: CKind; ref: string; title: string; members: number | null; last_error: string | null; last_fetched_at: string | null; brand_id: string | null; posts30: number; perWeek: number; avgViews: number; erPct: number | null; bestHour: number | null }

export async function competitorStats(orgId: string): Promise<CompStat[]> {
  const rows = await q<{ gname: string; id: string; group_id: string; kind: CKind; ref: string; title: string; members: number | null; last_error: string | null; last_fetched_at: string | null; brand_id: string | null; posts30: string; avgv: string | null }>(
    `select c.id,c.group_id,c.kind,c.ref,c.title,c.members,c.last_error,c.last_fetched_at,g.brand_id,g.name gname,
            (select count(*) from kz_competitor_posts p where p.competitor_id=c.id and p.posted_at > now() - interval '30 days') posts30,
            (select round(avg(views)) from kz_competitor_posts p where p.competitor_id=c.id and p.posted_at > now() - interval '30 days') avgv
       from kz_competitors c join kz_competitor_groups g on g.id=c.group_id where c.org_id=$1 order by g.created_at, c.created_at`, [orgId]);
  const hours = await q<{ competitor_id: string; h: number; v: string }>(
    `select competitor_id, extract(hour from posted_at at time zone 'Europe/Moscow')::int as h, avg(views) v from kz_competitor_posts where posted_at > now() - interval '60 days'
      and competitor_id in (select id from kz_competitors where org_id=$1) group by 1,2`, [orgId]);
  return rows.map((r) => {
    const mine = hours.filter((h) => h.competitor_id === r.id).sort((a, b) => Number(b.v) - Number(a.v))[0];
    const avg = Number(r.avgv ?? 0);
    return { ...r, posts30: Number(r.posts30), perWeek: Math.round((Number(r.posts30) / 30) * 7 * 10) / 10, avgViews: avg, erPct: r.members ? Math.round((avg / r.members) * 1000) / 10 : null, bestHour: mine?.h ?? null };
  });
}

export interface TopPost { id: string; comp: string; kind: string; ext_id: string; url: string; body: string; views: number; at: string }
export const topCompetitorPosts = (orgId: string, limit = 12) =>
  q<TopPost>(`select p.competitor_id||'|'||p.ext_id id,g.name||' · '||c.title comp,c.kind,p.ext_id,p.url,p.body,p.views,p.posted_at at from kz_competitor_posts p join kz_competitors c on c.id=p.competitor_id join kz_competitor_groups g on g.id=c.group_id
               where c.org_id=$1 and p.posted_at > now() - interval '60 days' order by p.views desc, p.posted_at desc limit $2`, [orgId, limit]);

/** Разбор ИИ: что заходит у конкурентов (форматы, темы, заходы), чем отличаемся и 5 идей для плана. Платно; при сбое возврат. */
export async function analyzeCompetitors(orgId: string): Promise<{ text?: string; error?: string }> {
  if (!aiReady()) return { error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const top = await topCompetitorPosts(orgId, 12);
  if (top.length < 3) return { error: "Для разбора нужно хотя бы 3 поста конкурентов. Добавьте источники и подождите загрузку." };
  const stats = await competitorStats(orgId);
  const mine = await q<{ topic: string; views: number }>(
    `select i.topic,s.views from kz_publications p join kz_post_stats s on s.publication_id=p.id join kz_content_items i on i.id=p.item_id where p.org_id=$1 and p.status='published' order by s.views desc limit 5`, [orgId]);
  const own = await one<{ avg: string | null }>("select round(avg(s.views)) avg from kz_publications p join kz_post_stats s on s.publication_id=p.id where p.org_id=$1 and p.status='published' and p.published_at > now() - interval '30 days'", [orgId]);
  try { await charge(orgId, PRICES.digest, "Разбор конкурентов"); }
  catch (e) { if (e instanceof InsufficientFunds) return { error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const data = [
      `Конкуренты: ${stats.map((s) => `${s.gname} / ${KIND_NAME[s.kind]} ${s.title} (${s.kind === "site" ? `${s.perWeek} материалов в неделю` : `${s.members ?? "?"} подписчиков, ${s.perWeek} постов в неделю, в среднем ${s.avgViews} просмотров`}${s.bestHour != null ? `, лучшее время ${s.bestHour}:00 МСК` : ""})`).join("; ")}`,
      `Лучшие посты конкурентов:\n${top.map((t) => `- [${t.comp}, ${t.views} просм.] ${t.body.slice(0, 220)}`).join("\n")}`,
      own?.avg ? `У нас в среднем ${own.avg} просмотров на пост за 30 дней.` : "У нас пока мало статистики.",
      mine.length ? `Наши лучшие посты:\n${mine.map((m) => `- ${m.topic} (${m.views})`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
    const text = await chat("analyst", "Ты аналитик контента. Пиши по-русски, конкретно, без воды. Опирайся только на переданные данные и честно говори, где данных мало. Не советуй копировать тексты конкурентов.",
      `${data}\n\nДай: 1) что заходит у конкурентов (темы, форматы, заходы, длина, время); 2) чем они сильнее и слабее нас по данным; 3) 5 идей для нашего плана с новым углом (не копии), по одной строке: тема + почему сработает.`, { maxTokens: 1600, temperature: 0.4, timeoutMs: 55_000 });
    return { text };
  } catch (e) { await refund(orgId, PRICES.digest, "ошибка разбора конкурентов"); return { error: `Не получилось, деньги возвращены: ${(e as Error).message}` }; }
}

/** Тема конкурента в наш план: идея с источником (его текст нужен только как фактура, пишем своими словами). */
export async function competitorPostToPlan(orgId: string, postKey: string, factoryId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [cid, ...rest] = postKey.split("|");
  const ext = rest.join("|");
  const p = await one<{ body: string; url: string; title: string }>(
    "select p.body,p.url,c.title from kz_competitor_posts p join kz_competitors c on c.id=p.competitor_id where p.competitor_id=$1 and p.ext_id=$2 and c.org_id=$3", [cid, ext, orgId]);
  if (!p) return { ok: false, error: "Пост не найден" };
  const fac = await one<{ brand_id: string }>("select brand_id from kz_factories where id=$1 and org_id=$2", [factoryId, orgId]);
  if (!fac) return { ok: false, error: "Выберите завод" };
  const topic = p.body.split(/[.!?\n]/)[0].trim().slice(0, 120) || p.body.slice(0, 120);
  const [d] = await allocateDates(factoryId, 1);
  const source = { title: `Пост конкурента «${p.title}»`, url: p.url, body: `${p.body}\n\nВАЖНО: это чужой пост. Возьми только идею и общие факты, напиши полностью своими словами с позиции нашего бренда, ничего не копируя.` };
  await q("insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,planned_for,meta) values($1,$2,$3,'post',$4,'',$5,$6)", [orgId, factoryId, fac.brand_id, topic, d, JSON.stringify({ source, fromCompetitor: true })]);
  return { ok: true };
}


export interface GroupSummary {
  id: string; name: string; brand_id: string | null; platforms: CompStat[];
  members: number | null; perWeek: number; posts30: number; avgViews: number; bestHour: number | null; lastPostAt: string | null; errors: number;
  best: { body: string; views: number; kind: CKind } | null;
}

/** Конкуренты с итогами по всем их площадкам: для главного экрана. Подписчики и просмотры считаются только по соцсетям, у сайта их нет. */
export async function groupSummaries(orgId: string): Promise<GroupSummary[]> {
  const [groups, stats, last, best] = await Promise.all([
    q<{ id: string; name: string; brand_id: string | null }>("select id,name,brand_id from kz_competitor_groups where org_id=$1 order by created_at", [orgId]),
    competitorStats(orgId),
    q<{ group_id: string; at: string }>("select c.group_id, max(p.posted_at) at from kz_competitor_posts p join kz_competitors c on c.id=p.competitor_id where c.org_id=$1 group by 1", [orgId]),
    q<{ group_id: string; body: string; views: number; kind: CKind }>(
      `select distinct on (c.group_id) c.group_id,p.body,p.views,c.kind from kz_competitor_posts p join kz_competitors c on c.id=p.competitor_id
        where c.org_id=$1 and p.posted_at > now() - interval '60 days' order by c.group_id, p.views desc, p.posted_at desc`, [orgId]),
  ]);
  return groups.map((g) => {
    const pl = stats.filter((s) => s.group_id === g.id);
    const social = pl.filter((s) => s.kind !== "site");
    const members = social.some((s) => s.members != null) ? social.reduce((a, s) => a + (s.members ?? 0), 0) : null;
    const views = social.filter((s) => s.avgViews > 0);
    const top = [...social].sort((a, b) => b.avgViews - a.avgViews)[0];
    return {
      ...g, platforms: pl, members,
      perWeek: Math.round(pl.reduce((a, s) => a + s.perWeek, 0) * 10) / 10, posts30: pl.reduce((a, s) => a + s.posts30, 0),
      avgViews: views.length ? Math.round(views.reduce((a, s) => a + s.avgViews, 0) / views.length) : 0,
      bestHour: top?.bestHour ?? pl.find((s) => s.bestHour != null)?.bestHour ?? null,
      lastPostAt: last.find((l) => l.group_id === g.id)?.at ?? null, errors: pl.filter((s) => s.last_error).length,
      best: best.find((b) => b.group_id === g.id) ?? null,
    };
  });
}

export interface PostFilter { platform: string; from: string | null; to: string | null; sort: "date" | "views"; q: string; limit: number }

/** Посты и материалы всех площадок конкурента с фильтрами. */
export async function groupPosts(orgId: string, groupId: string, f: PostFilter) {
  const args: unknown[] = [orgId, groupId]; let where = "";
  const add = (v: unknown) => { args.push(v); return `$${args.length}`; };
  if (f.platform) where += ` and c.id=${add(f.platform)}::uuid`;
  if (f.from) where += ` and p.posted_at >= ${add(f.from)}::timestamptz`;
  if (f.to) where += ` and p.posted_at < ${add(f.to)}::timestamptz`;
  if (f.q) {
    const esc = f.q.replace(/[%_\\]/g, "\\$&"), cap = esc.charAt(0).toUpperCase() + esc.slice(1).toLowerCase();
    where += ` and p.body ilike any(${add([...new Set([esc, esc.toLowerCase(), esc.toUpperCase(), cap])].map((x) => `%${x}%`))}::text[])`;
  }
  const rows = await q<TopPost & { platform: string }>(
    `select p.competitor_id||'|'||p.ext_id id,c.title comp,c.kind,p.ext_id,p.url,p.body,p.views,p.likes,p.posted_at at,c.id platform from kz_competitor_posts p join kz_competitors c on c.id=p.competitor_id
      where c.org_id=$1 and c.group_id=$2${where} order by ${f.sort === "views" ? "p.views desc, p.posted_at desc" : "p.posted_at desc"} limit ${Math.min(300, f.limit) + 1}`, args);
  const more = rows.length > f.limit; if (more) rows.length = f.limit;
  return { rows, more };
}
