import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { PRICES, rub } from "@/lib/wallet";
import { Chat } from "@/components/Chat";
import { loadHistoryWithCards } from "@/lib/agent/agent";
import { currentThread, listThreads } from "@/lib/agent/threads";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; t?: string }> }) {
  const { q, t } = await searchParams;
  const c = await requireCtx();
  if (c.org.role === "viewer") redirect("/app/overview");
  const threadId = await currentThread(c.org.id, c.user.id, t);
  const [history, threads] = await Promise.all([loadHistoryWithCards(c.org.id, c.user.id, 40, threadId), listThreads(c.org.id, c.user.id)]);
  return <Chat initial={history} threads={threads} threadId={threadId} name={c.user.name.trim().split(/\s+/)[0] ?? ""} free={c.org.unlimited} autoAsk={q?.slice(0, 1500)} price={rub(PRICES.idea)} />;
}
