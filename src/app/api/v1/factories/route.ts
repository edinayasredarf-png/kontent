import { q } from "@/lib/db";
import { apiOk, withApi } from "@/lib/apiv1";

export const dynamic = "force-dynamic";
export const GET = withApi(false, async (a) => apiOk({ factories: await q(
  "select id,brand_id,name,niche,product,formats,status,approval,autopublish,channel_ids from kz_factories where org_id=$1 order by created_at", [a.orgId]) }));
