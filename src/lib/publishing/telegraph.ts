import { parse, type HTMLElement, type Node as HtmlNode } from "node-html-parser";
import { PublishError, type Provider } from "./types";
import { api, jsonBody, mediaUrls } from "./http";
type TelegraphNode = string | { tag: string; attrs?: Record<string, string>; children?: TelegraphNode[] };
const tags = new Set("a aside b blockquote br code em figcaption figure h3 h4 hr i img li ol p pre s strong u ul".split(" "));
const url = (u: string) => { try { const v = new URL(u); return ["https:", "http:"].includes(v.protocol) ? v.href : null; } catch { return null; } };
export function telegraphContent(html: string): TelegraphNode[] {
  function convert(n: HtmlNode): TelegraphNode[] {
    if (n.nodeType === 3) return [n.text];
    const el = n as HTMLElement, raw = el.rawTagName?.toLowerCase();
    if (["script", "style", "iframe", "video"].includes(raw)) return [];
    const children = el.childNodes.flatMap(convert), tag = raw === "h1" || raw === "h2" ? "h3" : raw;
    if (!tags.has(tag)) return children;
    const attr = tag === "a" ? "href" : tag === "img" ? "src" : null;
    const value = attr ? url(el.getAttribute(attr) || "") : null;
    if (tag === "img" && !value) throw new PublishError("Telegra.ph: изображению статьи нужна публичная ссылка.");
    return [{ tag, ...(attr && value ? { attrs: { [attr]: value } } : {}), ...(children.length ? { children } : {}) }];
  }
  return parse(html).childNodes.flatMap(convert);
}
async function call(method: string, payload: unknown, final = false) {
  const j = await api("Telegra.ph", `https://api.telegra.ph/${method}`, jsonBody(payload), final);
  if (j.ok !== true || !j.result || typeof j.result !== "object") throw new PublishError("Telegra.ph: API не подтвердил результат.");
  return j.result as Record<string, unknown>;
}
export const telegraph: Provider = {
  kind: "telegraph",
  async verify(c) { if (!c.token) throw new PublishError("Укажите access_token Telegraph API."); const j = await call("getAccountInfo", { access_token: c.token, fields: ["short_name", "author_name"] }); return String(j.author_name || j.short_name || "Telegra.ph"); },
  async publish(input, c) {
    const content: TelegraphNode[] = input.article ? telegraphContent(input.article.html) : input.text.split(/\n\s*\n/).filter(Boolean).map(p => ({ tag: "p", children: [p] }));
    for (const src of mediaUrls(input)) content.push({ tag: "figure", children: [{ tag: "img", attrs: { src } }] });
    if (!content.length) throw new PublishError("Telegra.ph: пустая статья.");
    if (Buffer.byteLength(JSON.stringify(content), "utf8") > 64000) throw new PublishError("Telegra.ph: содержимое превышает 64 КБ.");
    const j = await call("createPage", { access_token: c.token, title: [...(input.article?.title || input.text.split("\n")[0] || "Публикация")].slice(0, 256).join(""), author_name: [...c.target].slice(0, 128).join(""), content, return_content: false }, true);
    if (typeof j.path !== "string" || typeof j.url !== "string" || !j.url.startsWith("https://telegra.ph/")) throw new PublishError("Telegra.ph не подтвердил адрес статьи. Проверьте аккаунт перед повторной отправкой.");
    return { externalId: j.path, url: j.url };
  },
};
