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
