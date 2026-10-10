"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { q } from "./db";
import { createVariant, genVariants, moreLikeThis, VARIANT_LABEL } from "./growth";
import { cleanStrategy, genStrategy, saveStrategy } from "./strategy";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (fid: string, id: string | null, err?: string) => { revalidatePath("/app", "layout"); redirect(`/app/factories/${fid}${id ? `?view=list&open=${id}` : ""}${err ? `${id ? "&" : "?"}err=${encodeURIComponent(err)}` : ""}${id ? `#i-${id}` : ""}`); };

export async function genStrategyAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory");
  const r = await genStrategy(c.org.id, fid);
  back(fid, null, r.ok ? undefined : r.error);
}

/** Ручная правка стратегии: позиционирование, боли (по одной в строке), до 8 рубрик. */
export async function saveStrategyAction(f: FormData) {
  const c = await requireWriter();
  const fid = s(f, "factory");
  const st = cleanStrategy({
    positioning: s(f, "positioning"), pains: String(f.get("pains") ?? "").split("\n"),
    rubrics: Array.from({ length: 8 }, (_, i) => ({ name: s(f, `rname_${i}`), share: Number(s(f, `rshare_${i}`)), desc: s(f, `rdesc_${i}`) })),
  });
  await saveStrategy(c.org.id, fid, st);
  back(fid, null);
}

export async function moreLikeThisAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), fid = s(f, "factory");
  const r = await moreLikeThis(c.org.id, id, Number(s(f, "count")) || 5);
  back(fid, id, r.ok ? undefined : r.error);
}

export async function createVariantAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), fid = s(f, "factory");
  const r = await createVariant(c.org.id, id);
  back(fid, id, r.ok ? undefined : r.error);
}

export async function genVariantsAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), fid = s(f, "factory");
  const r = await genVariants(c.org.id, id);
  back(fid, id, r.ok ? undefined : r.error);
}

/** Правка версий под площадки. Пустое поле удаляет версию (для канала берётся основной текст). */
export async function saveVariantsAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), fid = s(f, "factory");
  const v: Record<string, string> = {};
  for (const k of Object.keys(VARIANT_LABEL)) { const t = String(f.get(`v_${k}`) ?? "").replace(/\r/g, "").trim().slice(0, 4000); if (t) v[k] = t; }
  await q("update kz_content_items set meta = case when $3::jsonb = '{}'::jsonb then meta - 'variants' else meta || jsonb_build_object('variants',$3::jsonb) end, updated_at=now() where id=$1 and org_id=$2 and status not in ('published','generating')", [id, c.org.id, JSON.stringify(v)]);
  back(fid, id);
}
