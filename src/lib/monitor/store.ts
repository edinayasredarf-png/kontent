import { q } from "../db";
import { matchItem, type Kw } from "./keywords";
import type { Item } from "./parse";

export const loadKeywords = (orgId: string) => q<Kw & { id: string }>("select id,word,kind from kz_keywords where org_id=$1 order by kind,word", [orgId]);

/** One batch instead of one database round trip per post. Telegram copies also receive corrected text and fresh photo URLs. */
export async function storeItems(orgId: string, sourceId: string, items: Item[], refreshExisting = false): Promise<number> {
  if (!items.length) return 0;
  const kws = await loadKeywords(orgId);
  // Albums and overlapping fetches can contain the same external ID more than once.
  const unique = [...new Map(items.map((it) => [it.extId, it])).values()];
  const rows = unique.map((it) => ({ ext_id: it.extId, url: it.url, title: it.title, body: it.body,
    published_at: it.publishedAt.toISOString(), media: it.media ?? [], ...matchItem(it.title, it.body, kws) }));
  const result = await q<{ inserted: boolean }>(
    `insert into kz_feed_items as current(org_id,source_id,ext_id,url,title,body,published_at,matched,score,excluded,media)
     select $1::uuid,$2::uuid,r.ext_id,r.url,r.title,r.body,r.published_at,r.matched,r.score,r.excluded,r.media
       from jsonb_to_recordset($3::jsonb) as r(ext_id text,url text,title text,body text,published_at timestamptz,matched text[],score int,excluded boolean,media jsonb)
       order by r.ext_id
     on conflict(source_id,ext_id) do update
       set title=excluded.title,body=excluded.body,url=excluded.url,media=excluded.media,
           matched=excluded.matched,score=excluded.score,excluded=excluded.excluded
       where $4::boolean and current.org_id=excluded.org_id
         and (current.title,current.body,current.media) is distinct from (excluded.title,excluded.body,excluded.media)
     returning (xmax=0) inserted`,
    [orgId, sourceId, JSON.stringify(rows), refreshExisting]);
  return result.filter((r) => r.inserted).length;
}
