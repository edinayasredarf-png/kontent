"use server";
import { revalidatePath } from "next/cache";
import { canWrite, requireCtx } from "../auth";
import { askAgent, clearHistory, runMessageAction } from "./agent";

export async function sendChatAction(message: string, fileIds: string[] = []): Promise<{ error?: string }> {
  const c = await requireCtx();
  if (!canWrite(c.org.role)) return { error: "Ассистент тратит деньги на нейросети, поэтому недоступен роли «Наблюдатель»" };
  const r = await askAgent({ orgId: c.org.id, userId: c.user.id, userName: c.user.name, role: c.org.role }, String(message ?? ""), Array.isArray(fileIds) ? fileIds.map(String) : []);
  revalidatePath("/app");
  return r.ok ? {} : { error: r.error };
}

export async function chatActionRun(messageId: string, index: number): Promise<{ ok: boolean; text: string; href?: string }> {
  const c = await requireCtx();
  if (!canWrite(c.org.role)) return { ok: false, text: "Недостаточно прав: ваша роль только для просмотра" };
  const r = await runMessageAction({ orgId: c.org.id, role: c.org.role }, c.user.id, String(messageId), Number(index));
  revalidatePath("/app");
  return r;
}

export async function clearChatAction(): Promise<void> {
  const c = await requireCtx();
  await clearHistory(c.org.id, c.user.id);
  revalidatePath("/app");
}
