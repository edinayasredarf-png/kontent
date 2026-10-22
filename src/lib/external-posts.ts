import { parse as parseHtml } from "node-html-parser";
import { one, q } from "./db";
import { open } from "./crypto";
import { call as vkCall } from "./publishing/vk";
import { listPosts, maxToken } from "./publishing/max";
import { safeFetchText } from "./safefetch";
import { parseCount } from "./engage";
import { vkServiceError } from "./vk-service";

export type XKind = "telegram" | "vk" | "max";
export const MAX_EXTERNAL = 100;
export const XKIND_NAME: Record<XKind, string> = { telegram: "Telegram", vk: "VK", max: "MAX" };

export interface Metrics { views: number; likes: number; comments: number; reposts: number; extra: Record<string, number> }
export interface Fetched { author: string; body: string; at: Date | null; metrics: Metrics; channelId: string | null }
export type Parsed = { kind: "telegram"; ref: string; user: string; id: string } | { kind: "vk"; ref: string; owner: string; id: string } | { kind: "max"; ref: string; url: string };

/** Разбор ссылки на пост. Закрытые каналы (t.me/c/…) и ссылки не на пост отклоняются с понятной причиной. */
export function parsePostLink(input: string): Parsed {
  const v = input.trim();
  if (!v) throw new Error("Вставьте ссылку на пост");
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { throw new Error("Это не похоже на ссылку. Пример: https://t.me/channel/123"); }
  const host = u.hostname.replace(/^(www|m)\./i, "").toLowerCase();
  if (host === "t.me" || host === "telegram.me") {
    if (/^\/c\//.test(u.pathname)) throw new Error("Ссылки на закрытые каналы (t.me/c/…) читать нельзя: нужен публичный канал со ссылкой вида t.me/имя/123");
    const m = u.pathname.replace(/^\/s\//, "/").match(/^\/([A-Za-z][A-Za-z0-9_]{3,31})\/(\d+)\/?$/);
    if (!m) throw new Error("Нужна ссылка на конкретный пост: https://t.me/имя_канала/123");
    return { kind: "telegram", ref: `${m[1].toLowerCase()}/${m[2]}`, user: m[1], id: m[2] };
  }
  if (host === "vk.com" || host === "vk.ru") {
    const raw = `${u.pathname}${u.search}`;
    const m = raw.match(/wall(-?\d+)_(\d+)/);
    if (!m) throw new Error("Нужна ссылка на пост вида vk.com/wall-123_456 (откройте пост и скопируйте адрес из строки браузера)");
    return { kind: "vk", ref: `${m[1]}_${m[2]}`, owner: m[1], id: m[2] };
  }
  if (host === "max.ru" || host.endsWith(".max.ru")) {
    if (u.pathname.length < 3) throw new Error("Нужна ссылка на конкретный пост канала MAX");
    return { kind: "max", ref: `${host}${u.pathname.replace(/\/+$/, "")}`, url: u.toString().replace(/[?#].*$/, "") };
  }
  throw new Error("Поддерживаются ссылки на посты VK, Telegram и MAX");
}

/* ───────── Telegram ───────── */
const TG_BASE = () => (process.env.TG_WEB_BASE?.trim() || "https://t.me").replace(/\/+$/, "");
export function parseTgEmbed(html: string): { author: string; body: string; at: Date | null; views: number | null; reactions: number } {
  const root = parseHtml(html);
  const body = root.querySelector(".tgme_widget_message_text")?.text.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim() ?? "";
  const dt = Date.parse(root.querySelector(".tgme_widget_message_date time")?.getAttribute("datetime") ?? "");
  const vm = html.match(/class="tgme_widget_message_views"[^>]*>([^<]+)</);
  // реакции показываются не у всех каналов: считаем то, что есть на странице
  let reactions = 0;
  for (const r of root.querySelectorAll(".tgme_widget_message_reactions .tgme_reaction, .tgme_reaction")) { const n = parseCount((r.text.match(/([\d.,]+\s*[KkMm]?)\s*$/)?.[1] ?? "0").replace(/\s/g, "")); reactions += n; }
  return { author: root.querySelector(".tgme_widget_message_owner_name")?.text.trim() ?? "", body, at: Number.isNaN(dt) ? null : new Date(dt), views: vm ? parseCount(vm[1]) : null, reactions };
}
async function fetchTelegram(p: Extract<Parsed, { kind: "telegram" }>): Promise<Fetched> {
  const r = await safeFetchText(`${TG_BASE()}/${p.user}/${p.id}?embed=1&mode=tme`).catch((e: Error) => { throw new Error(`Telegram недоступен: ${e.message}`); });
  const x = parseTgEmbed(r.text);
  if (x.views === null && !x.body) throw new Error("Пост не найден: он удалён или канал закрыт. Читать можно только публичные каналы");
  return { author: x.author || `@${p.user}`, body: x.body, at: x.at, channelId: null, metrics: { views: x.views ?? 0, likes: x.reactions, comments: 0, reposts: 0, extra: {} } };
}

/* ───────── VK ───────── */
interface VkWall { id: number; owner_id: number; date: number; text?: string; copy_history?: { text?: string }[]; views?: { count: number }; likes?: { count: number }; comments?: { count: number }; reposts?: { count: number } }
async function fetchVk(orgId: string, p: Extract<Parsed, { kind: "vk" }>): Promise<Fetched> {
  // если сообщество подключено у нас, читаем его ключом (он отдаёт и охват); иначе общим сервисным ключом
  const chans = await q<{ id: string; credentials: unknown }>("select id,credentials from kz_channels where org_id=$1 and kind='vk' and status='active'", [orgId]);
  const own = chans.find((c) => { try { return String(open(c.credentials).target ?? "").replace(/^-/, "") === p.owner.replace(/^-/, ""); } catch { return false; } });
  const token = (own ? open(own.credentials).token : "") || process.env.VK_SERVICE_TOKEN?.trim() || "";
  if (!token) throw new Error("Для чтения VK на сервере не задан сервисный ключ (VK_SERVICE_TOKEN)");
  let res: { items?: VkWall[]; groups?: { id: number; name: string }[]; profiles?: { id: number; first_name: string; last_name: string }[] } | VkWall[];
  try { res = await vkCall(token, "wall.getById", { posts: `${p.owner}_${p.id}`, extended: "1" }); }
  catch (e) { const m = (e as Error).message; const c = Number(m.match(/код (\d+)/)?.[1]); throw new Error(c ? vkServiceError(c, m) : m); }
  const items = Array.isArray(res) ? res : res.items ?? [];
  const it = items.find((i) => String(i.id) === p.id) ?? items[0];
  if (!it) throw new Error("Пост не найден: он удалён или сообщество закрыто");
  const names = Array.isArray(res) ? [] : [...(res.groups ?? []).map((g) => g.name), ...(res.profiles ?? []).map((u) => `${u.first_name} ${u.last_name}`)];
  const extra: Record<string, number> = {};
  if (own) {
    // охват и действия читателей отдаёт только владелец сообщества
    try {
      const r = await vkCall<{ post_id: number; reach_total?: number; reach_subscribers?: number; links?: number; to_group?: number; join_group?: number; report?: number; hide?: number; unsubscribe?: number }[]>(token, "stats.getPostReach", { owner_id: p.owner, post_ids: p.id });
      const s = r[0];
      if (s) for (const k of ["reach_total", "reach_subscribers", "links", "to_group", "join_group", "report", "hide", "unsubscribe"] as const) if (typeof s[k] === "number") extra[k] = s[k]!;
    } catch { /* охват доступен не каждому ключу */ }
  }
  return {
    author: names[0] ?? "", body: (it.text?.trim() ? it.text : it.copy_history?.[0]?.text ?? "").replace(/\[(?:club|public|id)\d+\|([^\]]+)\]/g, "$1").trim(),
    at: new Date(it.date * 1000), channelId: own?.id ?? null,
    metrics: { views: it.views?.count ?? 0, likes: it.likes?.count ?? 0, comments: it.comments?.count ?? 0, reposts: it.reposts?.count ?? 0, extra },
  };
}

/* ───────── MAX ───────── */
async function fetchMax(orgId: string, p: Extract<Parsed, { kind: "max" }>): Promise<Fetched> {
  const chans = await q<{ id: string; credentials: unknown }>("select id,credentials from kz_channels where org_id=$1 and kind='max' and status='active'", [orgId]);
  if (!chans.length) throw new Error("Для MAX сначала подключите канал на странице «Каналы»: бот должен быть администратором, иначе MAX не отдаёт ни тексты, ни просмотры");
  const want = p.url.toLowerCase().replace(/\/+$/, "");
  const last = want.split("/").pop() ?? "";
  for (const ch of chans) {
    const c = open(ch.credentials) as Record<string, string>;
    const posts = await listPosts(maxToken(c), (c.target ?? "").trim(), { count: 100 }).catch(() => []);
    const hit = posts.find((x) => (x.url ?? "").toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "") === want || (last.length > 6 && x.mid.toLowerCase().includes(last)));
    if (hit) return { author: "", body: hit.text, at: hit.at, channelId: ch.id, metrics: { views: hit.views ?? 0, likes: 0, comments: 0, reposts: 0, extra: {} } };
  }
  throw new Error("Пост не найден среди последних 100 сообщений подключённых каналов MAX. Проверьте ссылку и что бот администратор того канала, где опубликован пост");
}

export async function fetchExternal(orgId: string, p: Parsed): Promise<Fetched> {
  return p.kind === "telegram" ? fetchTelegram(p) : p.kind === "vk" ? fetchVk(orgId, p) : fetchMax(orgId, p);
}

const snap = (postId: string, m: Metrics) => q("insert into kz_external_stats(post_id,views,likes,comments,reposts,extra) values($1,$2,$3,$4,$5,$6::jsonb)", [postId, m.views, m.likes, m.comments, m.reposts, JSON.stringify(m.extra)]);

/** Добавляет пост по ссылке: читает его, сохраняет и записывает первый снимок показателей. */
export async function addExternalPost(orgId: string, brandId: string | null, link: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let p: Parsed;
  try { p = parsePostLink(link); } catch (e) { return { ok: false, error: (e as Error).message }; }
  if (brandId && !(await one("select 1 from kz_brands where id=$1 and org_id=$2", [brandId, orgId]))) return { ok: false, error: "Бренд не найден" };
  const n = await one<{ n: string }>("select count(*) n from kz_external_posts where org_id=$1", [orgId]);
  if (Number(n!.n) >= MAX_EXTERNAL) return { ok: false, error: `Не больше ${MAX_EXTERNAL} материалов по ссылке: удалите ненужные` };
  if (await one("select 1 from kz_external_posts where org_id=$1 and kind=$2 and ext_ref=$3", [orgId, p.kind, p.ref])) return { ok: false, error: "Этот пост уже добавлен" };
  let f: Fetched;
  try { f = await fetchExternal(orgId, p); } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 400) }; }
  const url = link.trim().startsWith("http") ? link.trim() : `https://${link.trim()}`;
  const row = await one<{ id: string }>(
    `insert into kz_external_posts(org_id,brand_id,kind,url,ext_ref,channel_id,author,body,posted_at,last_fetched_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) returning id`,
    [orgId, brandId, p.kind, url.slice(0, 500), p.ref, f.channelId, f.author.slice(0, 120), f.body.slice(0, 8000), f.at?.toISOString() ?? null]);
  await snap(row!.id, f.metrics);
  return { ok: true, id: row!.id };
}

/** Обновляет показатели поста и дописывает снимок. Ошибка запоминается у поста и не стирает прежние данные. */
export async function refreshExternal(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await one<{ id: string; org_id: string; kind: XKind; url: string; ext_ref: string }>("select id,org_id,kind,url,ext_ref from kz_external_posts where id=$1", [id]);
  if (!r) return { ok: false, error: "Не найден" };
  try {
    const f = await fetchExternal(r.org_id, parsePostLink(r.url));
    await snap(r.id, f.metrics);
    await q("update kz_external_posts set last_fetched_at=now(), last_error=null, body=case when $2<>'' then $2 else body end, posted_at=coalesce($3::timestamptz,posted_at), channel_id=coalesce($4::uuid,channel_id) where id=$1", [r.id, f.body.slice(0, 8000), f.at?.toISOString() ?? null, f.channelId]);
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 400);
    await q("update kz_external_posts set last_error=$2, last_fetched_at=now() where id=$1", [r.id, msg]);
    return { ok: false, error: msg };
  }
}

/** Воркер: свежие посты обновляются чаще (раз в час в первые 3 дня, потом реже), посты старше 60 дней не трогаем. */
export async function collectExternal(limit = 12): Promise<{ updated: number; errors: string[] }> {
  const rows = await q<{ id: string }>(
    `select p.id from kz_external_posts p where coalesce(p.posted_at,p.created_at) > now() - interval '60 days'
        and (p.last_fetched_at is null or p.last_fetched_at < now() - (case when coalesce(p.posted_at,p.created_at) > now() - interval '3 days' then interval '1 hour'
                                                                              when coalesce(p.posted_at,p.created_at) > now() - interval '14 days' then interval '6 hours' else interval '24 hours' end))
        and not exists (select 1 from kz_orgs o where o.id=p.org_id and o.suspended)
      order by p.last_fetched_at nulls first limit $1`, [limit]);
  const out = { updated: 0, errors: [] as string[] };
  for (const r of rows) { const x = await refreshExternal(r.id); if (x.ok) out.updated++; else out.errors.push(`external: ${x.error}`.slice(0, 140)); }
  return out;
}

export interface XRow {
  id: string; kind: XKind; url: string; author: string; body: string; posted_at: string | null; created_at: string; last_error: string | null; last_fetched_at: string | null; brand_id: string | null;
  views: number; likes: number; comments: number; reposts: number; extra: Record<string, number>; d24: number | null; first_views: number | null;
}

/** Список материалов по ссылке с последними показателями и приростом просмотров за сутки. */
export async function listExternal(orgId: string, f: { from?: string | null; to?: string | null; brand?: string }): Promise<XRow[]> {
  const args: unknown[] = [orgId]; let where = "";
  const add = (v: unknown) => { args.push(v); return `$${args.length}`; };
  if (f.from) where += ` and coalesce(p.posted_at,p.created_at) >= ${add(f.from)}::timestamptz`;
  if (f.to) where += ` and coalesce(p.posted_at,p.created_at) < ${add(f.to)}::timestamptz`;
  if (f.brand) where += ` and p.brand_id = ${add(f.brand)}::uuid`;
  return q<XRow>(
    `select p.id,p.kind,p.url,p.author,p.body,p.posted_at,p.created_at,p.last_error,p.last_fetched_at,p.brand_id,
            coalesce(s.views,0) views,coalesce(s.likes,0) likes,coalesce(s.comments,0) comments,coalesce(s.reposts,0) reposts,coalesce(s.extra,'{}'::jsonb) extra,
            (s.views - (select x.views from kz_external_stats x where x.post_id=p.id and x.fetched_at <= now() - interval '24 hours' order by x.fetched_at desc limit 1)) d24,
            (select x.views from kz_external_stats x where x.post_id=p.id order by x.fetched_at limit 1) first_views
       from kz_external_posts p left join lateral (select * from kz_external_stats x where x.post_id=p.id order by x.fetched_at desc limit 1) s on true
      where p.org_id=$1${where} order by coalesce(p.posted_at,p.created_at) desc limit 200`, args);
}

export async function externalHistory(orgId: string, id: string) {
  return q<{ at: string; views: number; likes: number; comments: number; reposts: number }>(
    `select x.fetched_at at,x.views,x.likes,x.comments,x.reposts from kz_external_stats x join kz_external_posts p on p.id=x.post_id where p.id=$1 and p.org_id=$2 order by x.fetched_at`, [id, orgId]);
}
