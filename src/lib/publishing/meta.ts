import { PublishError, type Provider } from "./types";
import { api, bearer, externalId, media, mediaUrls, noArticle, numericTarget, textLimit } from "./http";
const FB = "https://graph.facebook.com/v27.0";
const THREADS = "https://graph.threads.com/v1.0";
async function graph(base: string, path: string, token: string, params?: Record<string, string>, final = false) {
  const body = params ? new URLSearchParams(params) : undefined;
  return api(base === FB ? "Meta" : "Threads", `${base}/${path}`, { method: params ? "POST" : "GET", headers: bearer(token), body }, final);
}
async function permalink(base: string, id: string, token: string, field: string): Promise<string | null> {
  // Publication already succeeded: a failed metadata request must never trigger another post.
  try { const j = await graph(base, `${id}?fields=${field}`, token); const u = j[field]; return typeof u === "string" && u.startsWith("https://") ? u : null; } catch { return null; }
}
async function ready(base: string, id: string, token: string, threads: boolean) {
  for (let n = 0; n < 5; n++) {
    const j = await graph(base, `${id}?fields=${threads ? "status" : "status_code"}`, token);
    const status = threads ? j.status : j.status_code;
    if (status === "FINISHED") return;
    if (status !== "IN_PROGRESS") throw new PublishError("Meta: изображение не готово к публикации. Проверьте доступность файла и формат JPEG.");
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new PublishError("Meta ещё обрабатывает изображения. Публикация не запускалась; повторите позже.", true);
}
export const facebook: Provider = {
  kind: "facebook",
  async verify(c) { const id = numericTarget(c); const j = await graph(FB, `${id}?fields=id,name,category`, c.token); externalId(j, "Facebook"); return String(j.name || "Facebook Page"); },
  async publish(input, c) {
    noArticle(input); const id = numericTarget(c), images = media(input); textLimit(input.text, 63206, "Facebook");
    if (images.length > 10) throw new PublishError("Facebook: поддерживается до 10 изображений за публикацию.");
    const uploaded: string[] = [];
    for (const img of images) {
      const form = new FormData(); form.set("published", "false"); form.set("source", new Blob([new Uint8Array(img.data)], { type: img.mime }), "image.jpg");
      const j = await api("Facebook", `${FB}/${id}/photos`, { method: "POST", headers: bearer(c.token), body: form });
      uploaded.push(externalId(j, "Facebook"));
    }
    if (!input.text.trim() && !uploaded.length) throw new PublishError("Facebook: пустой пост.");
    const params: Record<string, string> = { message: input.text };
    if (uploaded.length) params.attached_media = JSON.stringify(uploaded.map(media_fbid => ({ media_fbid })));
    const j = await graph(FB, `${id}/feed`, c.token, params, true), post = externalId(j, "Facebook");
    return { externalId: post, url: await permalink(FB, post, c.token, "permalink_url") };
  },
};
function mediaProvider(threads: boolean): Provider {
  const base = threads ? THREADS : FB, kind = threads ? "threads" : "instagram", label = threads ? "Threads" : "Instagram";
  return {
    kind,
    async verify(c) { const id = numericTarget(c); const j = await graph(base, `${id}?fields=id,username`, c.token); externalId(j, label); return String(j.username || label); },
    async publish(input, c) {
      noArticle(input); const id = numericTarget(c), images = media(input); textLimit(input.text, threads ? 500 : 2200, label);
      if (images.length > (threads ? 20 : 10)) throw new PublishError(`${label}: слишком много слайдов (максимум ${threads ? 20 : 10}).`);
      if (!images.length && (!threads || !input.text.trim())) throw new PublishError(`${label}: ${threads ? "пустой пост" : "добавьте изображение"}.`);
      const urls = mediaUrls(input).map(raw => { const u = new URL(raw); if (!threads) u.searchParams.set("format", "jpeg"); return u.href; }), edge = threads ? "threads" : "media";
      const make = async (params: Record<string, string>) => externalId(await graph(base, `${id}/${edge}`, c.token, params), label);
      let container: string;
      if (urls.length > 1) {
        const children: string[] = [];
        for (const image_url of urls) {
          const child = await make({ image_url, is_carousel_item: "true", ...(threads ? { media_type: "IMAGE" } : {}) });
          await ready(base, child, c.token, threads); children.push(child);
        }
        container = await make({ media_type: "CAROUSEL", children: children.join(","), [threads ? "text" : "caption"]: input.text });
      } else container = await make({ [threads ? "text" : "caption"]: input.text, ...(urls.length ? { image_url: urls[0], ...(threads ? { media_type: "IMAGE" } : {}) } : { media_type: "TEXT" }) });
      await ready(base, container, c.token, threads);
      const j = await graph(base, `${id}/${threads ? "threads_publish" : "media_publish"}`, c.token, { creation_id: container }, true);
      const post = externalId(j, label);
      return { externalId: post, url: await permalink(base, post, c.token, "permalink") };
    },
  };
}
export const instagram = mediaProvider(false);
export const threads = mediaProvider(true);
