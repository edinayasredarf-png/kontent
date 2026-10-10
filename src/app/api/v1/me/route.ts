import { one } from "@/lib/db";
import { apiOk, withApi } from "@/lib/apiv1";

export const dynamic = "force-dynamic";
/** Организация ключа и баланс (для неограниченных организаций баланс не показывается). */
export const GET = withApi(false, async (a) => {
  const o = await one<{ name: string; balance_kop: string; unlimited: boolean }>("select name,balance_kop,unlimited from kz_orgs where id=$1", [a.orgId]);
  return apiOk({ organization: o?.name, role: a.role, balance_rub: o?.unlimited ? null : Number(o?.balance_kop ?? 0) / 100, unlimited: !!o?.unlimited, rate_limit_remaining: a.remaining });
});
