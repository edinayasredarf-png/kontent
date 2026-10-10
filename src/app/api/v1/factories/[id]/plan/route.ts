import { buildPlan } from "@/lib/pipeline";
import { apiError, apiOk, readJson, UUID, withApi } from "@/lib/apiv1";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Сгенерировать план идей: { days: 1..30 }. Списывается как в кабинете. */
export const POST = withApi(true, async (a, req) => {
  const id = new URL(req.url).pathname.split("/").slice(-2)[0] ?? "";
  if (!UUID.test(id)) return apiError(400, "Неверный id завода");
  const b = (await readJson(req)) ?? {};
  const days = Math.round(Number(b.days) || 7);
  if (days < 1 || days > 30) return apiError(400, "days: от 1 до 30");
  const r = await buildPlan(a.orgId, id, days);
  return r.ok ? apiOk({ ok: true, days }, 201) : apiError(402, r.error ?? "Не удалось построить план");
});
