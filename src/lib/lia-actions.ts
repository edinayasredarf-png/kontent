"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx, requireWriter } from "./auth";
import { askLia, quickLaunch, type Msg } from "./lia";

export async function askLiaAction(history: Msg[], message: string) {
  const c = await requireCtx();
  if (c.org.role === "viewer") return { error: "Недостаточно прав" };
  return askLia(c.org.id, Array.isArray(history) ? history : [], String(message ?? ""));
}

export async function quickLaunchAction(_: unknown, f: FormData) {
  const c = await requireWriter();
  const r = await quickLaunch({ orgId: c.org.id, plan: c.org.plan, unlimited: c.org.unlimited, description: String(f.get("description") ?? "") });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app", "layout");
  redirect(`/app/factories/${r.factoryId}`);
}
