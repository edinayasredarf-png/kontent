import { PublishError, type Provider } from "./types";
import { api, externalId, media, noArticle, textLimit } from "./http";
function endpoint(raw: string): string {
  let u: URL; try { u = new URL(raw); } catch { throw new PublishError("Укажите Webhook URL из настроек канала Discord."); }
  if (u.protocol !== "https:" || u.hostname !== "discord.com" || u.port || u.username || u.password || !/^\/api(?:\/v10)?\/webhooks\/\d+\/[\w-]+$/.test(u.pathname)) throw new PublishError("Нужна ссылка https://discord.com/api/webhooks/ID/TOKEN.");
  return `https://discord.com${u.pathname}`;
}
export const discord: Provider = {
  kind: "discord",
  async verify(c) { const j = await api("Discord", endpoint(c.target)); if (!j.channel_id) throw new PublishError("Discord: webhook не связан с каналом."); return String(j.name || "Discord"); },
  async publish(input, c) {
    noArticle(input); textLimit(input.text, 2000, "Discord"); const images = media(input);
    if (images.length > 10 || images.some(i => i.data.length > 10_000_000)) throw new PublishError("Discord: максимум 10 изображений, каждое до 10 МБ.");
    if (!input.text.trim() && !images.length) throw new PublishError("Discord: пустой пост.");
    const form = new FormData();
    form.set("payload_json", JSON.stringify({ content: input.text, allowed_mentions: { parse: [] }, attachments: images.map((_, id) => ({ id, filename: `image-${id + 1}.jpg` })) }));
    images.forEach((img, id) => form.set(`files[${id}]`, new Blob([new Uint8Array(img.data)], { type: img.mime }), `image-${id + 1}.jpg`));
    const j = await api("Discord", `${endpoint(c.target)}?wait=true`, { method: "POST", body: form }, true);
    const id = externalId(j, "Discord");
    return { externalId: id, url: j.channel_id ? `https://discord.com/channels/${j.guild_id || "@me"}/${j.channel_id}/${id}` : null };
  },
};
