import { enqueue } from "@/lib/pipeline";
import { apiError, apiOk, UUID, withApi } from "@/lib/apiv1";

export const dynamic = "force-dynamic";
/** Поставить готовый материал в очередь публикации в каналы его завода. */
export const POST = withApi(true, async (a, req) => {
  const id = new URL(req.url).pathname.split("/").slice(-2)[0] ?? "";
  if (!UUID.test(id)) return apiError(400, "Неверный id");
  const r = await enqueue(a.orgId, id);
  return r.ok ? apiOk({ queued: true }, 202) : apiError(409, r.error ?? "Не удалось поставить в очередь");
});
