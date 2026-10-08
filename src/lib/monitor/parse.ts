import { createHash } from "node:crypto";
import { parse as parseHtml } from "node-html-parser";

export interface Item { extId: string; url: string; title: string; body: string; publishedAt: Date }

export const sha = (s: string) => createHash("sha1").update(s.trim()).digest("hex");

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");
}
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (b: string, n: string) => b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, "i"))?.[1] ?? "";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export const looksLikeFeed = (t: string) => /<(rss|feed|rdf:RDF)[\s>]/i.test(t.slice(0, 3000));

/** RSS 2.0 / Atom. */
export function parseFeed(xml: string, baseUrl: string): Item[] {
  const out: Item[] = [];
  for (const b of xml.match(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi) ?? []) {
    const title = strip(tag(b, "title"));
    let link = decode(tag(b, "link")).trim();
    if (!link) link = b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
    if (!title || !link) continue;
    try { link = new URL(link, baseUrl).toString(); } catch { continue; }
    const pub = Date.parse(strip(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date")));
    const body = strip(tag(b, "content:encoded") || tag(b, "description") || tag(b, "summary") || tag(b, "content"));
    out.push({ extId: sha(tag(b, "guid") || link), url: link, title: clip(title, 300), body: clip(body, 4000), publishedAt: Number.isNaN(pub) ? new Date() : new Date(pub) });
  }
  return out;
}

/** Открытое превью публичного канала Telegram (t.me/s/<name>) — без токена и бота. */
export function parseTelegram(html: string, username: string): Item[] {
  const out: Item[] = [];
  for (const post of parseHtml(html).querySelectorAll(".tgme_widget_message_wrap")) {
    const text = post.querySelector(".tgme_widget_message_text")?.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const a = post.querySelector(".tgme_widget_message_date");
    const link = a?.getAttribute("href") || `https://t.me/${username}`;
    const dt = Date.parse(post.querySelector(".tgme_widget_message_date time")?.getAttribute("datetime") ?? "");
    out.push({ extId: sha(link), url: link, title: clip(text, 140), body: clip(text, 4000), publishedAt: Number.isNaN(dt) ? new Date() : new Date(dt) });
  }
  return out;
}

/** Адреса лент, объявленные на странице (<link rel="alternate" type="application/rss+xml">). */
export function discoverFeeds(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const l of parseHtml(html).querySelectorAll("link[rel~=alternate]")) {
    if (!/(rss|atom)\+xml/i.test(l.getAttribute("type") ?? "")) continue;
    const href = l.getAttribute("href");
    if (!href) continue;
    try { out.push(new URL(href, baseUrl).toString()); } catch { /* пропускаем кривой адрес */ }
  }
  return out;
}

/** Запасной путь для сайта без ленты: ссылки на материалы с главной. Дат нет — берём момент первого появления. */
export function scrapeLinks(html: string, baseUrl: string): Item[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>(); const out: Item[] = [];
  const root = parseHtml(html);
  root.querySelectorAll("nav, header, footer, aside, script, style").forEach((n) => n.remove());
  for (const a of root.querySelectorAll("a[href]")) {
    const text = a.text.replace(/\s+/g, " ").trim();
    if (text.length < 35 || text.split(" ").length < 5) continue; // меню и кнопки короткие, заголовки новостей — нет
    let u: URL;
    try { u = new URL(a.getAttribute("href")!, base); } catch { continue; }
    if (u.hostname !== base.hostname || !/^https?:$/.test(u.protocol) || u.pathname === "/" || u.pathname.length < 6) continue;
    u.hash = "";
    const key = u.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ extId: sha(key), url: key, title: clip(text, 300), body: "", publishedAt: new Date() });
    if (out.length >= 40) break;
  }
  return out;
}

export function pageTitle(html: string): string {
  return strip(parseHtml(html).querySelector("title")?.text ?? "").slice(0, 120);
}
