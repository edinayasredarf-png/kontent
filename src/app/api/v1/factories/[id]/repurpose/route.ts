import { repurposeSource } from "@/lib/pipeline";
import { apiError, apiOk, readJson, str, UUID, withApi } from "@/lib/apiv1";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Контент из одного источника: { url } или { text }, count 3..10. */
export const POST = withApi(true, async (a, req) => {
  const id = new URL(req.url).pathname.split("/").slice(-2)[0] ?? "";
  if (!UUID.test(id)) return apiError(400, "Неверный id завода");
  const b = await readJson(req);
  if (!b) return apiError(400, "Тело запроса должно быть JSON-объектом");
  const url = str(b.url, 500), text = typeof b.text === "string" ? b.text.slice(0, 30000) : "";
  if (!url && !text) return apiError(400, "Нужен url статьи или text");
  const r = await repurposeSource(a.orgId, id, { url, text, count: Number(b.count) || 5 });
  return r.ok ? apiOk({ ok: true, created: r.added }, 201) : apiError(422, r.error ?? "Не удалось разобрать источник");
});
