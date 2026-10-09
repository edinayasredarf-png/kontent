"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { one, q } from "./db";
import { addIdeas } from "./plan";
import { TOOLS, runTool, type Out } from "./studio";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function runToolAction(tool: string, _prev: unknown, f: FormData): Promise<Out> {
  const c = await requireWriter();
  const input: Record<string, string> = {};
  const def = TOOLS.find((t) => t.key === tool);
  for (const fld of def?.fields ?? []) input[fld.name] = s(f, fld.name);
  const r = await runTool(c.org.id, tool, input);
  revalidatePath("/app", "layout");
  return r;
}

export async function saveToBankAction(f: FormData) {
  const c = await requireWriter();
  const body = s(f, "body").slice(0, 8000), title = s(f, "title").slice(0, 200) || body.split("\n")[0].slice(0, 120);
  if (!body) return;
  await q("insert into kz_bank(org_id,brand_id,title,body,source) values($1,$2,$3,$4,$5)", [c.org.id, s(f, "brand") || null, title, body, s(f, "source").slice(0, 60)]);
  revalidatePath("/app/studio/bank");
}

export async function addBankAction(_: unknown, f: FormData) {
  const c = await requireWriter();
  const title = s(f, "title").slice(0, 200);
  if (title.length < 3) return { error: "Введите идею (минимум 3 символа)" };
  await q("insert into kz_bank(org_id,title,body,source) values($1,$2,$3,'вручную')", [c.org.id, title, s(f, "body").slice(0, 8000)]);
  revalidatePath("/app/studio/bank");
  return { ok: "Добавлено" };
}

export async function deleteBankAction(f: FormData) {
  const c = await requireWriter();
  await q("delete from kz_bank where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  revalidatePath("/app/studio/bank");
}

/** Из банка — идея в план завода (тема = заголовок, хук = первая строка текста, если есть). */
export async function bankToPlanAction(f: FormData) {
  const c = await requireWriter();
  const it = await one<{ title: string; body: string }>("select title,body from kz_bank where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  const fid = s(f, "factory");
  if (!it) return;
  const r = await addIdeas(c.org.id, fid, [{ topic: it.title, hook: it.body.split("\n")[0].slice(0, 280) }], s(f, "kind") || "post", false);
  revalidatePath("/app", "layout");
  redirect(r.ok ? `/app/factories/${fid}` : `/app/studio/bank?err=${encodeURIComponent(r.error)}`);
}

export async function deleteStudioAssetAction(f: FormData) {
  const c = await requireWriter();
  await q("delete from kz_assets where id=$1 and org_id=$2 and kind='studio'", [s(f, "id"), c.org.id]);
  revalidatePath("/app/studio/library");
}
