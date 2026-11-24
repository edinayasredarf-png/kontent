import { q, one } from "./db";
import type { XRow, XKind } from "./external-posts";
export interface PublishedAnalyticsRow extends XRow { publication: true; assets: string[]; material_kind: string; item_id: string }
/** Read native publications directly: visibility never depends on an import or a successful API stats refresh. */
export async function publishedAnalytics(orgId: string, filter: { from?: string | null; to?: string | null; brand?: string; channel?: string; format?: string }, id?: string): Promise<PublishedAnalyticsRow[]> {
  const args: unknown[] = [orgId]; let where = "";
  const add=(value:unknown)=>{args.push(value);return `$${args.length}`;};
  if (id) where+=` and p.id::text=${add(id)}`;
  if (filter.from) where+=` and p.published_at>=${add(filter.from)}::timestamptz`;
  if (filter.to) where+=` and p.published_at<${add(filter.to)}::timestamptz`;
  if (filter.brand) where+=` and i.brand_id=${add(filter.brand)}::uuid`;
  if (filter.channel) where+=` and p.channel_id=${add(filter.channel)}::uuid`;
  if (filter.format) where+=` and i.kind=${add(filter.format)}`;
  return q<PublishedAnalyticsRow>(`select true publication,p.id,i.id item_id,i.kind material_kind,c.kind,p.external_url url,c.title author,i.body,p.published_at::text posted_at,p.created_at::text,p.error last_error,s.fetched_at::text last_fetched_at,i.brand_id,
    coalesce(s.views,0) views,coalesce(s.likes,0) likes,coalesce(s.comments,0) comments,coalesce(s.reposts,0) reposts,'{}'::jsonb extra,null::int d24,null::int first_views,
    array(select a.id::text from kz_assets a where a.org_id=p.org_id and (case when i.kind in ('carousel','infographic') then a.item_id=i.id and a.position>=0 else a.id=i.image_id end) order by a.position limit 10) assets,
    0 image_count,p.published_at::text media_checked_at
    from kz_publications p join kz_content_items i on i.id=p.item_id and i.org_id=p.org_id join kz_channels c on c.id=p.channel_id and c.org_id=p.org_id
    left join kz_post_stats s on s.publication_id=p.id
    where p.org_id=$1 and p.status='published' and c.kind in ('vk','telegram','max')${where}
    order by p.published_at desc limit 200`,args);
}
export async function publicationBrand(orgId: string, id: string) {
  return one<{name:string}>("select b.name from kz_publications p join kz_content_items i on i.id=p.item_id join kz_brands b on b.id=i.brand_id where p.id::text=$1 and p.org_id=$2",[id,orgId]);
}
export function isPublished(row: XRow | PublishedAnalyticsRow): row is PublishedAnalyticsRow { return "publication" in row && row.publication === true; }
export function nativeKindName(kind: XKind) { return kind === "vk" ? "VK" : kind === "telegram" ? "Telegram" : "MAX"; }
