import { requireCtx } from "@/lib/auth";
import { PRICES, rub } from "@/lib/wallet";
import { Chat } from "@/components/Chat";
import { loadHistoryWithCards } from "@/lib/agent/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const c = await requireCtx();
  const history = await loadHistoryWithCards(c.org.id, c.user.id);
  return <Chat initial={history} name={c.user.name.trim().split(/\s+/)[0] ?? ""} free={c.org.unlimited} autoAsk={q?.slice(0, 1500)} price={rub(PRICES.idea)} />;
}
