import sharp from "sharp";
import { one, q } from "../db";
import { safeFetchBuffer, safeFetchText } from "../safefetch";
import { parseTelegram, type Media } from "./parse";
import { telegramPostPath } from "./telegram-widget";

export interface NewsMediaRow { id: string; url: string; media: Media[] }
/** Refresh expiring Telegram CDN URLs from the exact public post, also for older saved posts. */
async function reloadTelegramMedia(org: string, row: NewsMediaRow): Promise<Media[]> {
  const path = telegramPostPath(row.url);
  if (!path) throw new Error("Not a public Telegram post");
  const page = await safeFetchText(`https://t.me/s/${path}`, {maxBytes: 2_000_000});
  const post = parseTelegram(page.text, path.split("/")[0]).find(p => telegramPostPath(p.url) === path);
  if (!post) throw new Error("Post unavailable");
  const media = post.media ?? [];
  await q("update kz_feed_items set media=$3::jsonb,published_at=$4 where id=$1 and org_id=$2", [row.id,org,JSON.stringify(media),post.publishedAt]);
  return media;
}

const refreshing = new Map<string,Promise<Media[]>>();
export async function refreshTelegramMedia(org: string, row: NewsMediaRow): Promise<Media[]> {
  const key = `${org}:${row.id}`;
  const pending = refreshing.get(key); if (pending) return pending;
  const work = reloadTelegramMedia(org,row); refreshing.set(key,work);
  try {return await work;} finally {refreshing.delete(key);}
}

// Bounded warm-instance cache; browser caches are private and every request is authorised first.
const cache = new Map<string, {data:Buffer; mime:string; until:number}>();
const inFlight = new Map<string,Promise<{data:Buffer;mime:string}>>();
export async function newsMediaBytes(org: string, row: NewsMediaRow, index: number) {
  const key = `${org}:${row.id}:${index}`;
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) {cache.delete(key);cache.set(key,cached);return cached;}
  const existing = inFlight.get(key); if (existing) return existing;
  const work = (async () => {
    let media = row.media ?? [];
    const download = async () => {
      const m = media[index];
      if (!m?.url || !["image","video"].includes(m.type)) throw new Error("Media unavailable");
      const result = await safeFetchBuffer(m.url, m.type === "video" ? 32_000_000 : 12_000_000);
      if (m.type === "video") {
        if (!/^video\/(mp4|webm)(?:;|$)/i.test(result.contentType)) throw new Error("Unsupported video");
        return {data:result.data,mime:result.contentType.split(";")[0]};
      }
      // Re-encode images: never serve SVG, HTML, metadata or arbitrary upstream bytes as an image.
      const data = await sharp(result.data,{limitInputPixels:40_000_000}).rotate().resize({width:1800,height:1800,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer();
      return {data,mime:"image/webp"};
    };
    let result;
    try { result = await download(); }
    catch {media = await refreshTelegramMedia(org,row);result = await download();}
    cache.set(key,{...result,until:Date.now()+3_600_000});
    let size = [...cache.values()].reduce((sum,v)=>sum+v.data.length,0);
    for (const [k,v] of cache) {if (size<=48_000_000 && cache.size<=200) break;cache.delete(k);size-=v.data.length;}
    return result;
  })();
  inFlight.set(key,work);
  try {return await work;} finally {inFlight.delete(key);}
}
export const loadNewsMedia = (org:string,id:string) => one<NewsMediaRow>("select i.id,i.url,i.media from kz_feed_items i join kz_sources s on s.id=i.source_id where i.id=$1 and i.org_id=$2 and s.kind='telegram'",[id,org]);
