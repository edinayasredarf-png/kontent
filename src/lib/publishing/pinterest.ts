import { PublishError, type Provider } from "./types";
import { api, bearer, externalId, jsonBody, media, noArticle, numericTarget, textLimit } from "./http";
export const pinterest: Provider = {
  kind: "pinterest",
  async verify(c) { const id = numericTarget(c); const j = await api("Pinterest", `https://api.pinterest.com/v5/boards/${id}`, { headers: bearer(c.token) }); if (!j.id) throw new PublishError("Pinterest: доска не найдена."); return String(j.name || "Pinterest"); },
  async publish(input, c) {
    noArticle(input); const board = numericTarget(c), images = media(input); textLimit(input.text, 800, "Pinterest");
    if (!images.length || images.length > 5) throw new PublishError("Pinterest: нужна картинка или карусель из 2–5 слайдов.");
    if (images.some(i => !["image/jpeg", "image/png"].includes(i.mime) || i.data.length > 10_000_000)) throw new PublishError("Pinterest: нужны JPEG/PNG до 10 МБ.");
    const items = images.map(i => ({ content_type: i.mime, data: i.data.toString("base64") }));
    const init = jsonBody({ board_id: board, title: [...input.text.split("\n")[0]].slice(0, 100).join(""), description: input.text, media_source: images.length === 1 ? { source_type: "image_base64", ...items[0] } : { source_type: "multiple_image_base64", items } });
    const j = await api("Pinterest", "https://api.pinterest.com/v5/pins", { ...init, headers: { ...init.headers, ...bearer(c.token) } }, true);
    const id = externalId(j, "Pinterest"); return { externalId: id, url: `https://www.pinterest.com/pin/${id}/` };
  },
};
