/** Retain image URLs only. Downloads go through the authenticated, SSRF-safe proxy. */
interface Photo { sizes?: { url?: string; width?: number; height?: number }[] }
interface Attachment { type?: string; photo?: Photo; link?: { photo?: Photo }; video?: { image?: { url?: string; width?: number; height?: number }[] } }
export interface VkMediaPost { attachments?: Attachment[]; copy_history?: VkMediaPost[] }
export function vkPostImages(post: VkMediaPost): string[] {
  const result: string[] = [];
  const visit = (item: VkMediaPost, depth: number) => {
    for (const a of item.attachments ?? []) {
      const sizes = a.type === "photo" ? a.photo?.sizes : a.type === "link" ? a.link?.photo?.sizes : a.type === "video" ? a.video?.image : [];
      const url = [...(sizes ?? [])].sort((a,b) => (b.width ?? 0) * (b.height ?? 1) - (a.width ?? 0) * (a.height ?? 1))[0]?.url;
      if (url && /^https:\/\//i.test(url) && !result.includes(url)) result.push(url);
    }
    if (depth < 2) for (const copy of item.copy_history ?? []) visit(copy, depth + 1);
  };
  visit(post, 0);
  return result.slice(0, 10);
}
