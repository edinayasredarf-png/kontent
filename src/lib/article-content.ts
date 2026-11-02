import { parse, type HTMLElement, type Node } from "node-html-parser";
import type { Media } from "./monitor/parse";

export { ARTICLE_STATUS } from "./monitor/article-state";
export const NOISE_SELECTOR = "head,script,style,noscript,svg,iframe,form,nav,header,footer,aside,button,select,input,textarea,dialog,[role=navigation],[role=banner],[role=contentinfo],[role=dialog],[aria-hidden=true],[hidden],[inert]";
export const NOISE_CLASS = /(?:^|[-_\s])(?:nav|menu|cookie|consent|breadcrumb|sidebar|share|sharing|social|comments?|related|recommended|recommendations|subscribe|newsletter|login|signup|auth|modal|popup|advert\w*|adfox\w*|ads?|footer|toolbar|pagination|print|promo|banner|sr-only|visually-hidden)(?:[-_\s]|$)/i;

export function articleUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw.trim(), base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function normalizeArticleText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+(?=\n)/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function textOf(node: Node): string {
  if (node.nodeType === 3) return node.text.replace(/\s+/g, " ");
  const el = node as HTMLElement, name = el.tagName?.toLowerCase();
  if (name === "br") return "\n";
  if (name === "pre") return `\n\n${el.text}\n\n`;
  const text = node.childNodes.map(textOf).join("");
  if (name === "li") return `\n• ${text.trim()}\n`;
  return name && /^(p|div|section|article|main|h[1-6]|ul|ol|blockquote|tr|figure|figcaption)$/.test(name) ? `\n\n${text.trim()}\n\n` : text;
}

export function cleanArticleFragment(html: string, base: string, title = ""): { text: string; media: Media[] } {
  // Plain-text RSS descriptions already contain meaningful paragraph breaks.
  if (!/<\/?[a-z][\s\S]*>/i.test(html)) return { text: normalizeArticleText(parse(`<span>${html}</span>`).text), media: [] };
  const root = parse(html);
  root.querySelectorAll(NOISE_SELECTOR).forEach((n) => n.remove());
  root.querySelectorAll("[class],[id],[style]").forEach((n) => {
    if (NOISE_CLASS.test(`${n.getAttribute("class") ?? ""} ${n.id ?? ""}`) || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(n.getAttribute("style") ?? "")) n.remove();
  });
  if (title) root.querySelectorAll("h1").forEach((n) => { if (n.text.replace(/\s+/g, " ").trim() === title.replace(/\s+/g, " ").trim()) n.remove(); });
  const media: Media[] = [];
  for (const img of root.querySelectorAll("img")) {
    const width = Number(img.getAttribute("width")), height = Number(img.getAttribute("height"));
    if ((width > 0 && width < 80) || (height > 0 && height < 60)) continue;
    const srcset = img.getAttribute("data-srcset") || img.getAttribute("srcset") || "";
    const large = srcset.split(",").map((s) => s.trim().split(/\s+/)).filter(([u]) => u).sort((a, b) => parseFloat(b[1] || "0") - parseFloat(a[1] || "0"))[0]?.[0];
    const raw = img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src") || large || img.getAttribute("src") || "";
    const url = articleUrl(raw, base);
    if (!raw || !url || /(?:^|[/_.-])(?:logo|icon|avatar|sprite|pixel|counter|gerb)(?:[/_.-]|$)/i.test(new URL(url).pathname)) continue;
    if (!media.some((m) => m.url === url) && media.filter((m) => m.type === "image").length < 10) media.push({ type: "image", url, name: img.getAttribute("alt")?.trim().slice(0, 160) || undefined });
  }
  for (const a of root.querySelectorAll("a[href]")) {
    const url = articleUrl(a.getAttribute("href") ?? "", base);
    const ext = url ? new URL(url).pathname.match(/\.(pdf|docx?|rtf|xlsx?|zip)$/i)?.[1] : null;
    if (!url || !ext || media.some((m) => m.url === url) || media.filter((m) => m.type === "file").length >= 6) continue;
    const label = a.text.replace(/\s+/g, " ").trim();
    media.push({ type: "file", url, name: !label || /^(файл[а-я]*|скачать|здесь|документ)$/i.test(label) ? `Документ (${ext.toUpperCase()})` : label.slice(0, 160) });
  }
  let text = normalizeArticleText(textOf(root));
  const firstBreak = text.indexOf("\n");
  if (title && firstBreak > 0 && text.slice(0, firstBreak).replace(/\s+/g, " ").trim() === title.replace(/\s+/g, " ").trim()) text = text.slice(firstBreak).trim();
  return { text, media };
}
