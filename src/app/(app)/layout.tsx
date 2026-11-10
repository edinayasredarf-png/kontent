import { readSession, requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { tokens as rub } from "@/lib/wallet";
import { unreadCount } from "@/lib/notify";
import { orgPlan } from "@/lib/plan-catalog";
import { AppShell } from "@/components/shell/AppShell";
import { ThemeSync } from "@/components/ThemeSync";
import { PendingBar } from "@/components/PendingBar";
import { NavProgress } from "@/components/NavProgress";
import { Suspense } from "react";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = requireCtx();
  const session = readSession();
  // The menu query depends on context, not on the notification counter. Start each as soon as its input is available.
  const [c, unread, factories, cookieStore] = await Promise.all([
    context,
    session.then((sess) => sess ? unreadCount(sess.uid) : 0),
    context.then((c) => q<{ id: string; name: string }>("select id,name from kz_factories where org_id=$1 order by created_at desc limit 15", [c.org.id]).catch(() => [])),
    cookies(),
  ]);
  const navCollapsed = cookieStore.get("lt_nav")?.value === "1";
  return (
    <>
      <ThemeSync theme={c.user.theme} />
      <PendingBar /><Suspense fallback={null}><NavProgress /></Suspense>
      <AppShell factories={factories} orgs={c.orgs} orgId={c.org.id} userName={c.user.name} email={c.user.email} userId={c.user.id} avatarV={c.user.avatarV} isAdmin={c.isAdmin} free={c.org.plan === "free" && !c.org.unlimited} initialCollapsed={navCollapsed}
        balance={rub(c.org.balance_kop)} unlimited={c.org.unlimited} planName={c.org.unlimited ? "Админ · без ограничений" : (await orgPlan(c.org.id)).name} unread={c.user.guest ? 0 : unread} role={c.org.role} guest={c.user.guest}>
        {children}
      </AppShell>
    </>
  );
}
