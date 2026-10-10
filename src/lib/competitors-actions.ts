"use server";
import { revalidatePath } from "next/cache";
import { requireWriter } from "./auth";
import { q } from "./db";
import { addCompetitor, analyzeCompetitors, competitorPostToPlan, refreshCompetitor } from "./competitors";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
type St = { error?: string; ok?: string };

export async function addCompetitorAction(_: unknown, f: FormData): Promise<St> {
  const c = await requireWriter();
  const r = await addCompetitor(c.org.id, s(f, "brand") || null, s(f, "kind"), s(f, "input"));
  revalidatePath("/app/competitors");
  return r.ok ? { ok: "Добавлено, посты загружены" } : { error: r.error };
}

export async function refreshCompetitorAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id");
  if (await q("select 1 from kz_competitors where id=$1 and org_id=$2", [id, c.org.id]).then((r) => r.length)) await refreshCompetitor(id);
  revalidatePath("/app/competitors");
}

export async function deleteCompetitorAction(f: FormData) {
  const c = await requireWriter();
  await q("delete from kz_competitors where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  revalidatePath("/app/competitors");
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

