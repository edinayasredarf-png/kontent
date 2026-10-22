"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { q } from "./db";
import { addExternalPost, refreshExternal } from "./external-posts";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
type St = { error?: string; ok?: string };

export async function addExternalAction(_: unknown, f: FormData): Promise<St> {
  const c = await requireWriter();
  const r = await addExternalPost(c.org.id, s(f, "brand") || null, s(f, "link"));
  revalidatePath("/app/analytics", "layout");
  if (r.ok) redirect(`/app/analytics/post/${r.id}`);
  return { error: r.error };
}

export async function refreshExternalAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id");
  if ((await q("select 1 from kz_external_posts where id=$1 and org_id=$2", [id, c.org.id])).length) await refreshExternal(id);
  revalidatePath("/app/analytics", "layout");
}

export async function deleteExternalAction(f: FormData) {
  const c = await requireWriter();
  await q("delete from kz_external_posts where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  revalidatePath("/app/analytics", "layout");
  redirect("/app/analytics");
}
