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

/** Картинка для превью ссылки (Open Graph): VK отклоняет сниппет, если фото не подходит по пропорциям (link_photo_sizing_rule), а слайды квадратные и вертикальные. Кладём слайд по центру на размытый фон 1200×630. */
export async function ogCard(data: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const W = 1200, H = 630;
  const bg = await sharp(data).resize(W, H, { fit: "cover" }).blur(24).modulate({ brightness: 0.85 }).jpeg({ quality: 80 }).toBuffer();
  const fg = await sharp(data).resize(W, H, { fit: "inside", withoutEnlargement: false }).jpeg({ quality: 90 }).toBuffer();
  return sharp(bg).composite([{ input: fg, gravity: "center" }]).jpeg({ quality: 88 }).toBuffer();
}
