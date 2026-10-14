import type { Kind } from "./fetchers";

/** Как показать источник в карточке новости: название и адрес, как у поста в Telegram. */
export function sourceView(kind: Kind, title: string, ref: string, config: Record<string, unknown> = {}): { name: string; address: string; href: string | null } {
  const real = typeof config.channelTitle === "string" ? config.channelTitle : "";
  const clean = real || title.replace(/^(Telegram|VK|MAX:|Новости:)\s*/i, "").trim() || title;
  if (kind === "telegram") return { name: clean, address: `t.me/${ref}`, href: `https://t.me/${ref}` };
  if (kind === "vk") return { name: clean, address: `vk.com/${ref}`, href: `https://vk.com/${ref}` };
  if (kind === "site") {
    try { const u = new URL(/^https?:\/\//i.test(ref) ? ref : `https://${ref}`); return { name: title, address: u.hostname.replace(/^www\./, ""), href: u.toString() }; } catch { return { name: title, address: ref, href: null }; }
  }
  if (kind === "news") return { name: clean, address: "поиск новостей по запросу", href: null };
  if (kind === "max") return { name: clean, address: "канал MAX", href: null };
  return { name: title, address: "добавлено вручную", href: null };
}
