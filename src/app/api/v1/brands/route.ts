import { q } from "@/lib/db";
import { apiOk, withApi } from "@/lib/apiv1";

export const dynamic = "force-dynamic";
export const GET = withApi(false, async (a) => apiOk({ brands: await q("select id,name,description,audience,tone,created_at from kz_brands where org_id=$1 order by name", [a.orgId]) }));
