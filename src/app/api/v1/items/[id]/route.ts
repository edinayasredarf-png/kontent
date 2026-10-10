import { one } from "@/lib/db";
import { apiError, apiOk, UUID, withApi } from "@/lib/apiv1";

export const dynamic = "force-dynamic";
export const GET = withApi(false, async (a, req) => {
  const id = new URL(req.url).pathname.split("/").pop() ?? "";
  if (!UUID.test(id)) return apiError(400, "Неверный id");
  const it = await one(`select id,factory_id,brand_id,kind,topic,hook,body,status,to_char(planned_for,'YYYY-MM-DD') planned_for,created_at,
      coalesce((select jsonb_agg(jsonb_build_object('channel_id',p.channel_id,'status',p.status,'url',p.external_url,'error',p.error,'published_at',p.published_at)) from kz_publications p where p.item_id=i.id),'[]'::jsonb) publications
    from kz_content_items i where id=$1 and org_id=$2`, [id, a.orgId]);
  return it ? apiOk(it) : apiError(404, "Материал не найден");
});
