import type { Media } from "./parse";

export const ARTICLE_STATUS = "article-v2";
export interface ArticleData { id: string; title: string; body: string; full_text: string | null; full_status: string; media: Media[] }

/** Automatic reading happens once; unavailable sources keep their excerpt and can be retried explicitly. */
export function articleNeedsLoading(kind: string, status: string, text: string | null): boolean {
  return (kind === "site" || kind === "news") && status !== "unsupported" && !status.startsWith(`${ARTICLE_STATUS}:`) && !(status === ARTICLE_STATUS && !!text);
}
