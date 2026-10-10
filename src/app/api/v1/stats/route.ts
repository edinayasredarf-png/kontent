import { analytics } from "@/lib/engage";
import { apiOk, withApi } from "@/lib/apiv1";

export const dynamic = "force-dynamic";
/** Сводка по публикациям: ?days=7|30|0 (0 — всё время). */
export const GET = withApi(false, async (a, req) => {
  const d = Number(new URL(req.url).searchParams.get("days"));
  const r = await analytics(a.orgId, d === 7 ? 7 : d === 0 ? 0 : 30);
  return apiOk({ posts: Number(r.tot.posts), views: Number(r.tot.views), likes: Number(r.tot.likes), comments: Number(r.tot.comments), reposts: Number(r.tot.reposts), by_channel: r.byChannel, by_kind: r.byKind, top: r.top, by_hour: r.byHour });
});
