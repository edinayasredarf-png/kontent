/** Canonical public post path, shared by the renderer and parser. Private/invite links cannot be embedded. */
export function telegramPostPath(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !["t.me", "telegram.me"].includes(u.hostname) || u.username || u.password || u.port) return null;
    const match = u.pathname.match(/^\/(?:s\/)?([A-Za-z][A-Za-z0-9_]{3,31})\/([1-9]\d*)\/?$/);
    return match ? `${match[1]}/${match[2]}` : null;
  } catch { return null; }
}

/** Only accept resize messages from the particular Telegram frame, with a bounded finite height. */
export function telegramWidgetHeight(data: unknown): number | null {
  try {
    const message = typeof data === "string" ? JSON.parse(data) : data;
    if (!message || message.event !== "resize" || typeof message.height !== "number" || !Number.isFinite(message.height)) return null;
    return message.height >= 80 && message.height <= 30_000 ? Math.ceil(message.height) : null;
  } catch { return null; }
}
