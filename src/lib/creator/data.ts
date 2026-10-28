import { q } from "../db";
import type { StudioSettings } from "./actions";

export interface PresetRow { id: string; name: string; settings: StudioSettings; sample: string | null; brand_id: string | null }

export const listPresets = (orgId: string) =>
  q<PresetRow>("select id,name,settings,sample_asset_id::text sample,brand_id from kz_creator_presets where org_id=$1 and kind='carousel' order by created_at desc limit 40", [orgId]).catch(() => [] as PresetRow[]);

/** Есть ли у бренда загруженный логотип: от этого зависит вопрос про логотип перед созданием. */
export async function brandLogoState(orgId: string, brandIds: string[]) {
  if (!brandIds.length) return {} as Record<string, boolean>;
  const rows = await q<{ brand_id: string }>("select distinct brand_id from kz_assets where org_id=$1 and kind='logo' and brand_id = any($2::uuid[])", [orgId, brandIds]);
  return Object.fromEntries(brandIds.map((b) => [b, rows.some((r) => r.brand_id === b)]));
}
