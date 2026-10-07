import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Токены каналов лежат в БД зашифрованными: утечка дампа не отдаёт доступ к чужим Telegram/VK.
function key(): Buffer {
  const s = process.env.CHANNEL_SECRET || process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("Не задан CHANNEL_SECRET или AUTH_SECRET");
    return createHash("sha256").update("dev-only").digest();
  }
  return createHash("sha256").update(s).digest();
}

export function seal(obj: Record<string, string>): { enc: string } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return { enc: Buffer.concat([iv, c.getAuthTag(), data]).toString("base64") };
}

export function open(v: unknown): Record<string, string> {
  const enc = (v as { enc?: string } | null)?.enc;
  if (!enc) return {};
  const b = Buffer.from(enc, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
}
