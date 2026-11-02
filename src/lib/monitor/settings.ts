"use server";
import { requireWriter } from "@/lib/auth";
import { q } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { KIND_LABEL, type Kind } from "./fetchers";
import { PRICES, rub } from "@/lib/wallet";

/** Loaded only when the settings drawer is actually opened. Always scoped to the authenticated organization. */
export async function loadMonitorSettings() {
  const c = await requireWriter();
  const [sources, kws, maxCh, brands] = await Promise.all([
    q<{ id: string; kind: Kind; title: string; ref: string; config: Record<string, unknown> | null; status: string; last_fetched_at: string | null; last_error: string | null; items: string }>(
      `select s.id,s.kind,s.title,s.ref,s.config,s.status,s.last_fetched_at,s.last_error,(select count(*) from kz_feed_items i where i.source_id=s.id) items
         from kz_sources s where s.org_id=$1 order by s.created_at`, [c.org.id]),
    q<{ id: string; word: string; kind: string }>("select id,word,kind from kz_keywords where org_id=$1 order by kind,word", [c.org.id]),
    q<{ id: string; title: string }>("select id,title from kz_channels where org_id=$1 and kind='max' and status='active' order by created_at", [c.org.id]),
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]),
  ]);
  return { sources, kws, maxCh, brands, limit: c.org.unlimited ? null : PLANS[c.org.plan].sources,
    vkOn: !!process.env.VK_SERVICE_TOKEN?.trim(), kindLabels: KIND_LABEL,
    priceLabel: c.org.unlimited ? "бесплатно для админа" : rub(PRICES.idea) };
}
export type MonitorSettingsData = Awaited<ReturnType<typeof loadMonitorSettings>>;
