import { readSession, requireCtx } from "@/lib/auth";
import { one } from "@/lib/db";
import { rub } from "@/lib/wallet";
import { PLANS } from "@/lib/plans";
import { AppShell } from "@/components/shell/AppShell";
import { ThemeSync } from "@/components/ThemeSync";
import { PendingBar } from "@/components/PendingBar";
import { NavProgress } from "@/components/NavProgress";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sess = await readSession();
  // число «горящих» дел для колокольчика: ошибки публикации, идеи на одобрении, новые комментарии
  const [c, a] = await Promise.all([requireCtx(), one<{ n: string }>(
    `select ((select count(*) from kz_publications where org_id=$1 and status='failed' and created_at > now() - interval '7 days')
           + (select count(*) from kz_content_items i join kz_factories f on f.id=i.factory_id where i.org_id=$1 and i.status='idea' and f.approval='manual')
           + (select count(*) from kz_comments where org_id=$1 and status='new')) n`, [sess?.org ?? "00000000-0000-0000-0000-000000000000"]).catch(() => null)]);
  return (
    <>
      <ThemeSync theme={c.user.theme} />
      <PendingBar /><Suspense fallback={null}><NavProgress /></Suspense>
      <AppShell orgs={c.orgs} orgId={c.org.id} userName={c.user.name} email={c.user.email} isAdmin={c.isAdmin} free={c.org.plan === "free" && !c.org.unlimited}
        balance={rub(c.org.balance_kop)} unlimited={c.org.unlimited} planName={c.org.unlimited ? "Админ · без ограничений" : PLANS[c.org.plan].name} alerts={Number(a?.n ?? 0)}>
        {children}
      </AppShell>
    </>
  );
}
