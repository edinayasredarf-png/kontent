"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { q } from "./db";
import { attachFlowImage, attachOwnImage, removeFlowImage, reworkFlowImage, reworkItemImage } from "./item-images";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function backFactory(fid: string, id: string, r: { ok: boolean; error?: string; note?: string }): never {
  revalidatePath("/app", "layout");
  const q = new URLSearchParams({ tab: "plan", view: "list", open: id });
  if (!r.ok && r.error) q.set("err", r.error); else if (r.note) q.set("note", r.note);
  redirect(`/app/factories/${fid}?${q}`);
}

/** Текст поста, который человек правил в поле: сохраняем, чтобы работа с изображением его не сбрасывала. */
async function keepText(orgId: string, f: FormData) {
  const t = String(f.get("text") ?? "").trim();
  if (t.length >= 5) await q("update kz_flow_items set text=$3, updated_at=now() where id=$1 and org_id=$2 and status in ('pending','ready','failed')", [s(f, "item"), orgId, t.slice(0, 6000)]);
}

function backFlow(flowId: string, r: { ok: boolean; error?: string; note?: string }): never {
  revalidatePath("/app", "layout");
  const q = new URLSearchParams({ t: "pending" });
  if (!r.ok && r.error) q.set("err", r.error); else if (r.note) q.set("note", r.note);
  redirect(`/app/flows/${flowId}?${q}`);
}

/** Своё изображение к материалу завода. */
export async function attachItemImageAction(f: FormData) {
  const c = await requireWriter();
  const r = await attachOwnImage(c.org.id, s(f, "id"), f.get("image"));
  backFactory(s(f, "factory"), s(f, "id"), r);
}

/** Доработка изображения материала ИИ. */
export async function reworkItemImageAction(f: FormData) {
  const c = await requireWriter();
  const r = await reworkItemImage(c.org.id, s(f, "id"), s(f, "instruction"));
  backFactory(s(f, "factory"), s(f, "id"), r);
}

export async function attachFlowImageAction(f: FormData) {
  const c = await requireWriter();
  await keepText(c.org.id, f);
  backFlow(s(f, "flow"), await attachFlowImage(c.org.id, s(f, "item"), f.get("image")));
}

export async function reworkFlowImageAction(f: FormData) {
  const c = await requireWriter();
  await keepText(c.org.id, f);
  backFlow(s(f, "flow"), await reworkFlowImage(c.org.id, s(f, "item"), s(f, "instruction")));
}

export async function removeFlowImageAction(f: FormData) {
  const c = await requireWriter();
  await keepText(c.org.id, f);
  await removeFlowImage(c.org.id, s(f, "item"));
  backFlow(s(f, "flow"), { ok: true });
}
