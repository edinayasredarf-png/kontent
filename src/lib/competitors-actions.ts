"use server";
import { revalidatePath } from "next/cache";
import { requireWriter } from "./auth";
import { q } from "./db";
import { addCompetitor, addPlatform, analyzeCompetitors, competitorPostToPlan, refreshCompetitor } from "./competitors";
import { redirect } from "next/navigation";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
type St = { error?: string; ok?: string };

/** Новый конкурент: название и первая площадка. После добавления открываем страницу конкурента. */
export async function addCompetitorAction(_: unknown, f: FormData): Promise<St> {
  const c = await requireWriter();
  const r = await addCompetitor(c.org.id, s(f, "brand") || null, s(f, "kind"), s(f, "input"), s(f, "name"));
  revalidatePath("/app/competitors");
  if (r.ok) redirect(`/app/competitors/${r.id}`);
  return { error: r.error };
}

export async function addPlatformAction(_: unknown, f: FormData): Promise<St> {
  const c = await requireWriter();
  const r = await addPlatform(c.org.id, s(f, "group"), s(f, "kind"), s(f, "input"));
  revalidatePath("/app/competitors", "layout");
  return r.ok ? { ok: "Площадка добавлена, посты загружены" } : { error: r.error };
}

/** Обновить все площадки конкурента (или одну, если указан id площадки). */
export async function refreshCompetitorAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), group = s(f, "group");
  const ids = id ? await q<{ id: string }>("select id from kz_competitors where id=$1 and org_id=$2", [id, c.org.id]) : await q<{ id: string }>("select id from kz_competitors where group_id=$1 and org_id=$2", [group, c.org.id]);
  for (const r of ids) await refreshCompetitor(r.id);
  revalidatePath("/app/competitors", "layout");
}

export async function deletePlatformAction(f: FormData) {
  const c = await requireWriter();
  const r = await q<{ group_id: string }>("delete from kz_competitors where id=$1 and org_id=$2 returning group_id", [s(f, "id"), c.org.id]);
  revalidatePath("/app/competitors", "layout");
  // последняя площадка ушла — конкурент без площадок не нужен
  if (r[0] && !(await q("select 1 from kz_competitors where group_id=$1", [r[0].group_id])).length) {
    await q("delete from kz_competitor_groups where id=$1 and org_id=$2", [r[0].group_id, c.org.id]);
    redirect("/app/competitors");
  }
}

export async function deleteCompetitorAction(f: FormData) {
  const c = await requireWriter();
  await q("delete from kz_competitor_groups where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  revalidatePath("/app/competitors", "layout");
  redirect("/app/competitors");
}

export async function analyzeCompetitorsAction(): Promise<{ text?: string; error?: string }> {
  const c = await requireWriter();
  return analyzeCompetitors(c.org.id);
}

export async function competitorToPlanAction(_: unknown, f: FormData): Promise<St> {
  const c = await requireWriter();
  const r = await competitorPostToPlan(c.org.id, s(f, "post"), s(f, "factory"));
  revalidatePath("/app/competitors");
  return r.ok ? { ok: "Тема добавлена в план завода" } : { error: r.error };
}

