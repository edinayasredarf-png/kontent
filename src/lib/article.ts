import { articleUrl, cleanArticleFragment, NOISE_CLASS, NOISE_SELECTOR } from "./article-content";
import type { Media } from "./monitor/parse";

export interface Article { title: string; text: string; media: Media[] }
const BODY_SELECTOR = '[itemprop="articleBody"],.article-body,.article__body,.article-content,.entry-content,.post-content,.story-body,.news-text,.text-block';

/** Server-only reader mode: does not execute scripts, load resources, or fall back to the whole page. */
export async function extractArticle(html: string, url: string): Promise<Article | null> {
  const [{ Readability }, { parseHTML }] = await Promise.all([import("@mozilla/readability"), import("linkedom")]);
  const { document } = parseHTML(html);
  Object.defineProperties(document, { baseURI: { value: url }, documentURI: { value: url } });
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "";
  const explicitTitle = (document.querySelector('article h1,[itemprop="headline"],main h1,h1')?.textContent ?? "").replace(/\s+/g, " ").trim();
  document.querySelectorAll(NOISE_SELECTOR.replace("head,", "")).forEach((n) => n.remove());
  document.querySelectorAll("[class],[id],[style]").forEach((n) => {
    if (NOISE_CLASS.test(`${n.className} ${n.id}`) || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(n.getAttribute("style") ?? "")) n.remove();
  });
  const clean = (content: string, title: string) => ({ title, ...cleanArticleFragment(content, url, title) });
  // Short but explicit article bodies (e.g. a PDF attachment) are preferable to a long unrelated sidebar.
  const candidates = Array.from(document.querySelectorAll(BODY_SELECTOR)).map((node) => clean(node.innerHTML, explicitTitle)).filter((a) => a.text.length >= 100 || a.media.some((m) => m.type === "file"));
  let result: Article | undefined = candidates.sort((a, b) => b.text.length - a.text.length)[0];
  if (!result) {
    const article = new Readability(document as unknown as Document, { charThreshold: 250, maxElemsToParse: 40_000 }).parse();
    if (article?.content) {
      const candidate = clean(article.content, explicitTitle || article.title || "");
      if (candidate.text.length >= 200 || candidate.media.some((m) => m.type === "file")) result = candidate;
    }
  }
  if (!result || !result.text || /^(?:вход|авторизация|доступ запрещ[её]н|access denied|just a moment)/i.test(result.text)) return null;
  // An article cover may be declared only in metadata. Never use metadata images for a missing article.
  const image = ogImage && articleUrl(ogImage, url);
  if (result.text.length >= 150 && !result.media.some((m) => m.type === "image") && image && !/(?:logo|icon|avatar|gerb|placeholder|pk-og-image|\/layout\/)/i.test(new URL(image).pathname)) result.media.unshift({ type: "image", url: image });
  return result;
}
