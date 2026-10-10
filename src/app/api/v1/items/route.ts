import { one, q } from "@/lib/db";
import { addIdeas } from "@/lib/plan";
import { apiError, apiOk, readJson, str, UUID, withApi } from "@/lib/apiv1";

export const dynamic = "force-dynamic";
const STATUSES = ["idea", "approved", "generating", "ready", "scheduled", "published", "failed", "rejected"];

/** Список материалов: ?factory=<id>&status=ready&limit=50&offset=0 */
export const GET = withApi(false, async (a, req) => {
  const u = new URL(req.url), args: unknown[] = [a.orgId], cond: string[] = [];
  const f = u.searchParams.get("factory"), s = u.searchParams.get("status");
  if (f) { if (!UUID.test(f)) return apiError(400, "factory должен быть id завода"); args.push(f); cond.push(`factory_id=$${args.length}`); }
  if (s) { if (!STATUSES.includes(s)) return apiError(400, `status: один из ${STATUSES.join(", ")}`); args.push(s); cond.push(`status=$${args.length}`); }
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit")) || 50)), offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  args.push(limit, offset);
  const items = await q(`select id,factory_id,brand_id,kind,topic,hook,body,status,to_char(planned_for,'YYYY-MM-DD') planned_for,created_at from kz_content_items
                          where org_id=$1 ${cond.map((c) => "and " + c).join(" ")} order by created_at desc limit $${args.length - 1} offset $${args.length}`, args);
  return apiOk({ items, limit, offset });
});

/**
 * Создать материал. Без body — идея (тема + хук), её можно сгенерировать позже; с body — готовый текст, который сразу можно публиковать.
 * { factory, topic, hook?, kind?, date?, approve?, body? }
 */
export const POST = withApi(true, async (a, req) => {
  const b = await readJson(req);
  if (!b) return apiError(400, "Тело запроса должно быть JSON-объектом");
  const factory = str(b.factory, 40), topic = str(b.topic, 300), hook = str(b.hook, 300), body = typeof b.body === "string" ? b.body.trim().slice(0, 20000) : "";
  if (!UUID.test(factory)) return apiError(400, "Нужен factory — id завода (GET /api/v1/factories)");
  if (topic.length < 3) return apiError(400, "Нужен topic — тема, минимум 3 символа");
  const date = str(b.date, 10) || undefined;
  if (!body) {
    const r = await addIdeas(a.orgId, factory, [{ topic, hook }], str(b.kind, 20), b.approve === true, date);
    return r.ok ? apiOk({ created: r.added }, 201) : apiError(400, r.error ?? "Не удалось создать");
  }
  const fac = await one<{ brand_id: string; formats: string[] }>("select brand_id,formats from kz_factories where id=$1 and org_id=$2", [factory, a.orgId]);
  if (!fac) return apiError(404, "Завод не найден");
  const kind = ["post", "story"].includes(str(b.kind, 20)) ? str(b.kind, 20) : "post";
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiError(400, "date: формат ГГГГ-ММ-ДД");
  const row = await one<{ id: string }>(
    "insert into kz_content_items(org_id,factory_id,brand_id,kind,topic,hook,body,planned_for,status,meta) values($1,$2,$3,$4,$5,$6,$7,coalesce($8::date,current_date),'ready','{\"manual\":true,\"api\":true}') returning id",
    [a.orgId, factory, fac.brand_id, kind, topic, hook, body, date ?? null]);
  return apiOk({ id: row!.id, status: "ready" }, 201);
});
