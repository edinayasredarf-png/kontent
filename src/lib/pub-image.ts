import { createHmac, timingSafeEqual } from "node:crypto";

const sig = (id: string) => createHmac("sha256", process.env.AUTH_SECRET || "dev-only").update(`pub-image:${id}`).digest("hex").slice(0, 32);

/** Подписанная публичная ссылка на картинку: нужна, чтобы Telegram показал её над длинным текстом одним сообщением. Без APP_URL — null. */
export function pubImageUrl(id: string): string | undefined {
  const base = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/api/pub/${id}?s=${sig(id)}` : undefined;
}

export function checkPubSig(id: string, s: string): boolean {
  const a = Buffer.from(sig(id)), b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Картинки статьи лежат у нас за входом (/api/assets/…). Для публикации на сайт заменяем их подписанными публичными ссылками (нужен APP_URL). */
export function publicizeImages(html: string): string {
  return html.replace(/src="\/api\/assets\/([0-9a-f-]{36})"/gi, (m, id: string) => { const u = pubImageUrl(id); return u ? `src="${u}"` : m; });
}
