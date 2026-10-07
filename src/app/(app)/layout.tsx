import Link from "next/link";
import { Coins } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { rub } from "@/lib/wallet";
import { PLANS } from "@/lib/plans";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const c = await requireCtx();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar orgs={c.orgs} orgId={c.org.id} user={c.user.email} />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-end gap-3 border-b border-line px-5 py-3 md:px-8">
          <span className="chip">{PLANS[c.org.plan].name}</span>
          <Link href="/app/billing" className="btn btn-ghost !py-1.5"><Coins size={15} className="text-warn" />{rub(c.org.balance_kop)}</Link>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
