import { requireCtx } from "@/lib/auth";
import { Chat } from "@/components/Chat";
import { loadHistory } from "@/lib/agent/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const c = await requireCtx();
  const history = await loadHistory(c.org.id, c.user.id);
  return <Chat initial={history} name={c.user.name.trim().split(/\s+/)[0] ?? ""} free={c.org.unlimited} autoAsk={q?.slice(0, 1500)} />;
}
