import { createHmac } from "node:crypto";
import { PublishError, type Provider } from "./types";
import { safeRequest } from "../safefetch";

/** credentials: target — адрес приёма (https://…), token — секрет для подписи. Любая CMS может принять статью и опубликовать сама. */
async function send(c: Record<string, string>, payload: unknown) {
  if (!c.target) throw new PublishError("Не указан адрес webhook");
  const body = JSON.stringify(payload), ts = String(Math.floor(Date.now() / 1000));
  const sig = c.token ? createHmac("sha256", c.token).update(`${ts}.${body}`).digest("hex") : "";
  let r: { status: number; text: string };
  try { r = await safeRequest(c.target, { method: "POST", headers: { "Content-Type": "application/json", "X-Timestamp": ts, ...(sig ? { "X-Signature": `sha256=${sig}` } : {}) }, body, timeoutMs: 30_000 }); }
  catch (e) { throw new PublishError(`Webhook недоступен: ${(e as Error).message}`, true); }
  if (r.status >= 300) throw new PublishError(`Webhook ответил ${r.status}: ${r.text.slice(0, 160)}`, r.status >= 500 || r.status === 429 || r.status === 408);
  let j: { url?: string; id?: string | number } = {}; try { j = JSON.parse(r.text); } catch { /* ответ не обязан быть JSON */ }
  return j;
}

export const webhook: Provider = {
  kind: "webhook",
  async verify(c) {
    await send(c, { event: "ping" });
    return new URL(c.target).hostname;
  },
  async publish(input, c) {
    const a = input.article;
    if (!a) {
      // обычный пост: мост в любые сети через n8n / Make / Zapier (Instagram, TikTok, Threads, X…)
      const r = await send(c, {
        event: "post.publish", text: input.text,
        image: input.image && input.image.data.length < 1_500_000 ? { mime: input.image.mime, base64: input.image.data.toString("base64") } : null,
      });
      return { externalId: String(r.id ?? Date.now()), url: typeof r.url === "string" && /^https?:\/\//.test(r.url) ? r.url : null };
    }
    const r = await send(c, {
      event: "article.publish", title: a.title, slug: a.slug, description: a.description, keywords: a.keywords, html: a.html,
      image: input.image && input.image.data.length < 1_500_000 ? { mime: input.image.mime, base64: input.image.data.toString("base64") } : null,
    });
    return { externalId: String(r.id ?? a.slug), url: typeof r.url === "string" && /^https?:\/\//.test(r.url) ? r.url : null };
  },
};
