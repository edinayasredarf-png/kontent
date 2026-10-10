import { randomBytes } from "node:crypto";
import { one, q } from "./db";
import { slugify } from "./seo";
import { SITE } from "./site";

export type LinkMode = "off" | "utm" | "track";
export const LINK_MODES: Record<LinkMode, string> = { off: "Не менять ссылки", utm: "Добавлять UTM-метки", track: "UTM-метки и счётчик переходов" };

const URL_RE = /https?:\/\/[^\s<>"'«»)\]]+/gi;
const TRAIL = /[.,;:!?…]+$/;
const host = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };

/** Добавляет utm_* к ссылке, не затирая уже заданные автором метки. */
export function tagUrl(raw: string, p: { source: string; campaign: string; content: string }): string {
  try {
    const u = new URL(raw);
    const set = (k: string, v: string) => { if (!u.searchParams.has(k)) u.searchParams.set(k, v); };
    set("utm_source", p.source); set("utm_medium", "social"); set("utm_campaign", p.campaign); set("utm_content", p.content);
    return u.toString();
  } catch { return raw; }
}

const SOURCE: Record<string, string> = { telegram: "telegram", vk: "vk", max: "max", webhook: "webhook", wordpress: "site" };

export interface LinkCtx { orgId: string; itemId: string; channelId: string; channelKind: string; ownLink: string; mode: LinkMode; brandName: string }

/**
 * Размечает ссылки в тексте перед публикацией. Трогаем только ссылки на сайт из настроек завода (host совпадает с «Ссылкой на сайт или товар»):
 * чужие ссылки (источники, соцсети) остаются как написал автор. В режиме track вместо прямой ссылки ставится наша короткая, которая считает клики.
 */
export async function prepareLinks(text: string, c: LinkCtx): Promise<string> {
  if (c.mode === "off" || !c.ownLink) return text;
  const own = host(c.ownLink);
  if (!own) return text;
  const meta = { source: SOURCE[c.channelKind] ?? c.channelKind, campaign: slugify(c.brandName) || "kontent", content: c.itemId.slice(0, 8) };
  const found = [...new Set(text.match(URL_RE) ?? [])];
  let out = text;
  for (const raw of found) {
    const url = raw.replace(TRAIL, "");
    if (host(url) !== own) continue;
    const tagged = tagUrl(url, meta);
    let rep = tagged;
    if (c.mode === "track") {
      const row = await one<{ code: string }>(
        `insert into kz_links(code,org_id,item_id,channel_id,url) values($1,$2,$3,$4,$5)
         on conflict (item_id,channel_id,url) where item_id is not null do update set url=excluded.url returning code`,
        [randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase(), c.orgId, c.itemId, c.channelId, tagged]);
      if (row) rep = `${SITE}/go/${row.code}`;
    }
    out = out.split(url).join(rep);
  }
  return out;
}

const BOT = /bot|crawler|spider|preview|facebookexternalhit|slurp|headless|monitor|vkshare|whatsapp|telegram|curl|wget/i;
/** Находит ссылку и засчитывает переход (не для ботов и предпросмотров). Возвращает адрес, куда вести. */
export async function resolveClick(code: string, userAgent: string): Promise<string | null> {
  if (!/^[a-z0-9]{6,12}$/.test(code)) return null;
  const counted = !BOT.test(userAgent);
  const r = await one<{ url: string }>(
    counted ? "update kz_links set clicks=clicks+1,last_click_at=now() where code=$1 returning url" : "select url from kz_links where code=$1", [code]);
  if (!r || !/^https?:\/\//i.test(r.url)) return null;
  return r.url;
}

/** Сколько переходов по ссылкам набрали материалы организации за период. */
export async function clicksByItem(orgId: string, itemIds: string[]): Promise<Map<string, number>> {
  if (!itemIds.length) return new Map();
  const rows = await q<{ item_id: string; n: string }>("select item_id,sum(clicks) n from kz_links where org_id=$1 and item_id = any($2::uuid[]) group by item_id", [orgId, itemIds]);
  return new Map(rows.map((r) => [r.item_id, Number(r.n)]));
}
