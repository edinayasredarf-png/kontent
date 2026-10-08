import { safeFetchText } from "../safefetch";
import { discoverFeeds, looksLikeFeed, pageTitle, parseFeed, parseTelegram, scrapeLinks, sha, type Item } from "./parse";

export type Kind = "site" | "telegram" | "vk" | "news" | "manual";
export const KIND_LABEL: Record<Kind, string> = { site: "Сайт / RSS", telegram: "Telegram", vk: "VK", news: "Новости по запросу", manual: "Вручную" };

export interface Resolved { ref: string; title: string; config: Record<string, unknown> }

const TG = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const VKD = /^[A-Za-z0-9_.]{2,50}$/;

/** Приводит ввод пользователя к каноническому виду и проверяет, что источник читается. */
export async function resolveSource(kind: Kind, input: string): Promise<Resolved> {
  const v = input.trim();
  if (!v) throw new Error("Укажите адрес или название");
  if (kind === "telegram") {
    const name = v.replace(/^https?:\/\/(t\.me|telegram\.me)\/(s\/)?/i, "").replace(/^@/, "").split(/[/?#]/)[0];
    if (!TG.test(name)) throw new Error("Нужен username публичного канала: @name или https://t.me/name");
    const items = await fetchItems("telegram", name, {});
    if (!items.length) throw new Error("Канал не найден, закрыт или в нём нет текстовых постов");
    return { ref: name.toLowerCase(), title: `Telegram @${name}`, config: {} };
  }
  if (kind === "vk") {
    const d = v.replace(/^https?:\/\/(m\.)?vk\.(com|ru)\//i, "").split(/[/?#]/)[0];
    if (!VKD.test(d)) throw new Error("Нужна ссылка на сообщество: vk.com/name или vk.com/club123");
    await fetchItems("vk", d, {});
    return { ref: d.toLowerCase(), title: `VK ${d}`, config: {} };
  }
  if (kind === "news") {
    if (v.length < 3 || v.length > 120) throw new Error("Запрос — от 3 до 120 символов");
    return { ref: v.toLowerCase(), title: `Новости: ${v}`, config: {} };
  }
  if (kind === "site") {
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    const page = await safeFetchText(url);
    if (looksLikeFeed(page.text)) {
      if (!parseFeed(page.text, page.url).length) throw new Error("В ленте нет записей");
      return { ref: page.url, title: new URL(page.url).hostname, config: { mode: "feed", feedUrl: page.url } };
    }
    const host = new URL(page.url).hostname;
    const title = pageTitle(page.text) || host;
    const cands = [...discoverFeeds(page.text, page.url), ...["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml"].map((p) => new URL(p, page.url).toString())];
    for (const c of [...new Set(cands)].slice(0, 6)) {
      try {
        const f = await safeFetchText(c, { maxBytes: 1_000_000 });
        if (looksLikeFeed(f.text) && parseFeed(f.text, f.url).length) return { ref: page.url, title, config: { mode: "feed", feedUrl: f.url } };
      } catch { /* пробуем следующий */ }
    }
    if (!scrapeLinks(page.text, page.url).length) throw new Error("На странице не нашли ни ленты, ни заголовков материалов");
    return { ref: page.url, title, config: { mode: "scrape" } };
  }
  throw new Error("Неизвестный тип источника");
}

export async function fetchItems(kind: Kind, ref: string, config: Record<string, unknown>): Promise<Item[]> {
  if (kind === "telegram") {
    const r = await safeFetchText(`https://t.me/s/${encodeURIComponent(ref)}`);
    return parseTelegram(r.text, ref).slice(-30).reverse();
  }
  if (kind === "news") {
    const r = await safeFetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(ref)}&hl=ru&gl=RU&ceid=RU:ru`, { maxBytes: 1_000_000 });
    return parseFeed(r.text, r.url).slice(0, 30);
  }
  if (kind === "site") {
    if (config.mode === "feed") {
      const r = await safeFetchText(String(config.feedUrl), { maxBytes: 1_500_000 });
      return parseFeed(r.text, r.url).slice(0, 40);
    }
    const r = await safeFetchText(ref);
    return scrapeLinks(r.text, r.url);
  }
  if (kind === "vk") {
    const token = process.env.VK_SERVICE_TOKEN?.trim();
    if (!token) throw new Error("Для VK не задан VK_SERVICE_TOKEN на сервере");
    const res = await fetch("https://api.vk.com/method/wall.get", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15_000),
      body: new URLSearchParams({ domain: ref, count: "30", filter: "owner", access_token: token, v: "5.199" }),
    });
    const j = (await res.json().catch(() => ({}))) as { response?: { items?: VkPost[] }; error?: { error_code: number; error_msg: string } };
    if (j.error) throw new Error(`VK: ${j.error.error_msg} (код ${j.error.error_code})`);
    return (j.response?.items ?? []).flatMap((p) => {
      const text = (p.text || p.copy_history?.[0]?.text || "").replace(/\s+/g, " ").trim();
      if (!text) return [];
      const url = `https://vk.com/wall${p.owner_id}_${p.id}`;
      return [{ extId: sha(url), url, title: text.length > 140 ? text.slice(0, 139) + "…" : text, body: text.slice(0, 4000), publishedAt: new Date(p.date * 1000) }];
    });
  }
  return [];
}
interface VkPost { id: number; owner_id: number; date: number; text?: string; copy_history?: { text?: string }[] }
