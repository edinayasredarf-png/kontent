import { q } from "../db";
import type { StudioSettings } from "./actions";
import type { CreateOpts } from "./consts";

/** Пресет карусели хранит настройки студии, пресет остальных материалов — тон, манеру, аудиторию и референс (`opts`, `refText`). */
export interface PresetRow { id: string; name: string; kind: string; settings: StudioSettings & { opts?: CreateOpts; refText?: string }; sample: string | null; brand_id: string | null }

export const listPresets = (orgId: string) =>
  q<PresetRow>("select id,name,kind,settings,sample_asset_id::text sample,brand_id from kz_creator_presets where org_id=$1 order by created_at desc limit 40", [orgId]).catch(() => [] as PresetRow[]);

/** Есть ли у бренда загруженный логотип: от этого зависит вопрос про логотип перед созданием. */
export async function brandLogoState(orgId: string, brandIds: string[]) {
  if (!brandIds.length) return {} as Record<string, boolean>;
  const rows = await q<{ brand_id: string }>("select distinct brand_id from kz_assets where org_id=$1 and kind='logo' and brand_id = any($2::uuid[])", [orgId, brandIds]);
  return Object.fromEntries(brandIds.map((b) => [b, rows.some((r) => r.brand_id === b)]));
}

import type { RefItem } from "./consts";

/** Недавние материалы организации: их можно приложить как референс («подгрузить ранее созданное») и открыть из истории. */
export interface RecentWork extends RefItem { kind: string; factoryId: string | null; at: string }
export async function recentWorks(orgId: string): Promise<RecentWork[]> {
  const rows = await q<{ id: string; kind: string; topic: string; body: string; meta: { carousel?: { slides?: { title: string; body: string }[]; photo?: { style?: string } } } | null; factory_id: string | null; at: string; thumb: string | null }>(
    `select i.id,i.kind,i.topic,i.body,i.meta,i.factory_id,i.created_at::text at,
            (select a.id::text from kz_assets a where a.item_id=i.id and a.position=0 and a.kind='generated' limit 1) thumb
       from kz_content_items i where i.org_id=$1 and i.status in ('ready','published','approved','scheduled') and i.body<>'' order by i.created_at desc limit 14`, [orgId]).catch(() => []);
  return rows.map((r) => {
    const c = r.meta?.carousel;
    const slides = (c?.slides ?? []).map((s) => `${s.title}. ${s.body}`).join(" / ");
    return { id: `w-${r.id}`, kind: r.kind, factoryId: r.factory_id, at: r.at, title: r.topic.slice(0, 70), thumb: r.thumb ? `/api/assets/${r.thumb}` : undefined, origin: "work" as const,
      visual: c?.photo?.style ?? "", text: `Образец (${r.kind}): ${(slides || r.body).replace(/\s+/g, " ").slice(0, 800)}` };
  });
}
