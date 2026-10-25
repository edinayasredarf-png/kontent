"use server";
import { revalidatePath } from "next/cache";
import { canWrite, requireCtx } from "../auth";
import { redirect } from "next/navigation";
import { startOnboarding } from "./onboarding";
import { createThread, deleteThread, listThreads, threadsReady, type Thread } from "./threads";
import { askAgent, clearHistory, runMessageAction } from "./agent";

export async function sendChatAction(message: string, fileIds: string[] = [], threadId: string | null = null): Promise<{ error?: string; threadId?: string }> {
  const c = await requireCtx();
  if (!canWrite(c.org.role)) return { error: "Ассистент тратит деньги на нейросети, поэтому недоступен роли «Наблюдатель»" };
  const r = await askAgent({ orgId: c.org.id, userId: c.user.id, userName: c.user.name, role: c.org.role }, String(message ?? ""), Array.isArray(fileIds) ? fileIds.map(String) : [], threadId);
  revalidatePath("/app");
  return r.ok ? { threadId: r.threadId } : { error: r.error };
}

export async function chatActionRun(messageId: string, index: number): Promise<{ ok: boolean; text: string; href?: string }> {
  const c = await requireCtx();
  if (!canWrite(c.org.role)) return { ok: false, text: "Недостаточно прав: ваша роль только для просмотра" };
  const r = await runMessageAction({ orgId: c.org.id, role: c.org.role }, c.user.id, String(messageId), Number(index));
  revalidatePath("/app");
  return r;
}

/** «Пройти обучение заново»: новый диалог «Знакомство» с приветствием и чек-листом. */
export async function restartOnboardingAction(): Promise<void> {
  const c = await requireCtx();
  if (!canWrite(c.org.role)) redirect("/app/overview");
  const id = await startOnboarding(c.org.id, c.user.id);
  redirect(id ? `/app?t=${id}` : `/app?q=${encodeURIComponent("Давай настроим всё с нуля")}`);
}

export async function clearChatAction(threadId: string | null = null): Promise<void> {
  const c = await requireCtx();
  if (threadId && (await threadsReady())) await deleteThread(c.org.id, c.user.id, threadId);
  else await clearHistory(c.org.id, c.user.id);
  revalidatePath("/app");
}

/** Новый пустой диалог (прежние остаются в списке). */
export async function newThreadAction(): Promise<string | null> {
  const c = await requireCtx();
  return createThread(c.org.id, c.user.id);
}

/** Поиск по диалогам: названия и тексты сообщений. */
export async function searchThreadsAction(query: string): Promise<Thread[]> {
  const c = await requireCtx();
  return listThreads(c.org.id, c.user.id, String(query ?? ""));
}
