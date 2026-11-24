import { q } from "../db";
/** Brand ownership is validated before source creation or reassignment. */
export async function validateSourceBrands(orgId: string, values: string[]): Promise<string[]> {
 const ids = [...new Set(values.filter(Boolean))];
 if (ids.length > 50 || ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Некорректный бренд");
 if (!ids.length) return [];
 const rows = await q<{id:string}>("select id from kz_brands where org_id=$1 and id=any($2::uuid[])", [orgId, ids]);
 if (rows.length !== ids.length) throw new Error("Бренд недоступен");
 return ids;
}
export async function setSourceBrands(orgId: string, sourceId: string, values: string[]) {
 const ids = await validateSourceBrands(orgId, values);
 const rows = await q("update kz_sources set config=jsonb_set(coalesce(config,'{}'::jsonb),'{brandIds}',$3::jsonb) where id::text=$1 and org_id=$2 returning id", [sourceId,orgId,JSON.stringify(ids)]);
 if (!rows.length) throw new Error("Источник недоступен");
}
