import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { PRICES, rub } from "@/lib/wallet";
import { Chat } from "@/components/Chat";
import { loadHistoryWithCards } from "@/lib/agent/agent";
import { currentThread, listThreads } from "@/lib/agent/threads";
import { learnFree, startOnboarding } from "@/lib/agent/onboarding";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; t?: string }> }) {
  const { q, t } = await searchParams;
  const c = await requireCtx();
  if (c.org.role === "viewer") redirect("/app/overview");
  let threadId = await currentThread(c.org.id, c.user.id, t);
  // новый клиент без брендов и без диалогов: сразу начинаем обучение
  if (!threadId && !q && !(await listThreads(c.org.id, c.user.id)).length) {
    const brands = Number((await one<{ n: string }>("select count(*) n from kz_brands where org_id=$1", [c.org.id]))?.n ?? 0);
    if (brands === 0) threadId = await startOnboarding(c.org.id, c.user.id);
  }
  const [history, threads] = await Promise.all([loadHistoryWithCards(c.org.id, c.user.id, 40, threadId), listThreads(c.org.id, c.user.id)]);
  const title = threadId ? (await one<{ title: string }>("select title from kz_chat_threads where id=$1", [threadId]))?.title ?? null : null;
  const learn = (await learnFree(c.org.id, title)).chat;
  return <Chat learn={learn} initial={history} threads={threads} threadId={threadId} name={c.user.name.trim().split(/\s+/)[0] ?? ""} free={c.org.unlimited} autoAsk={q?.slice(0, 1500)} price={rub(PRICES.idea)} />;
}
