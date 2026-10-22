"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { suggestReply } from "./comments";
import { requireCtx, requireWriter } from "./auth";
import { q } from "./db";
import { collectComments, collectStats, recommendations, replyToComment, type AFilter } from "./engage";
import { uuidOrEmpty } from "./range";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function refreshStatsAction() {
  const c = await requireWriter();
  // принудительно «устаревшими» делаем только свои публикации, остальных организаций не трогаем
  await q("update kz_post_stats set fetched_at = now() - interval '2 days' where org_id=$1", [c.org.id]);
  await collectStats(60);
  await collectComments(15);
  revalidatePath("/app", "layout");
}

// days приходит из bind() на странице, вторым аргументом React добавляет прежнее состояние формы
export async function recommendAction(f: AFilter, _prev: unknown) {
  const c = await requireCtx();
  if (c.org.role === "viewer") return { error: "Недостаточно прав" };
  // фильтр приходит с клиента: оставляем только даты и идентификаторы нужного вида
  const d = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return recommendations(c.org.id, { from: d(f?.from), to: d(f?.to), brand: uuidOrEmpty(f?.brand) || undefined, channel: uuidOrEmpty(f?.channel) || undefined, kind: typeof f?.kind === "string" && /^[a-z]{2,20}$/.test(f.kind) ? f.kind : undefined });
}

export async function commentStatusAction(f: FormData) {
  const c = await requireWriter();
  const st = s(f, "status");
  if (!["new", "done", "hidden"].includes(st)) return;
  await q("update kz_comments set status=$3 where id=$1 and org_id=$2", [s(f, "id"), c.org.id, st]);
  revalidatePath("/app/inbox");
}

export async function suggestReplyAction(f: FormData) {
  const c = await requireWriter();
  const r = await suggestReply(c.org.id, s(f, "id"));
  revalidatePath("/app/inbox");
  if (!r.ok) redirect(`/app/inbox?err=${encodeURIComponent(r.error)}`);
}

/** Скрыть все новые комментарии со спамом одним нажатием. */
export async function hideSpamAction() {
  const c = await requireWriter();
  await q("update kz_comments set status='hidden' where org_id=$1 and status='new' and tone='spam'", [c.org.id]);
  revalidatePath("/app/inbox");
}

export async function replyCommentAction(_: unknown, f: FormData) {
  const c = await requireWriter();
  const r = await replyToComment(c.org.id, s(f, "id"), s(f, "text"));
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/inbox");
  return { ok: "Ответ отправлен" };
}
