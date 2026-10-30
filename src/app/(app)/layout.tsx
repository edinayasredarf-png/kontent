import { readSession, requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { rub } from "@/lib/wallet";
import { unreadCount } from "@/lib/notify";
import { PLANS } from "@/lib/plans";
import { AppShell } from "@/components/shell/AppShell";
import { ThemeSync } from "@/components/ThemeSync";
import { PendingBar } from "@/components/PendingBar";
import { NavProgress } from "@/components/NavProgress";
import { Suspense } from "react";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sess = await readSession();
  const navCollapsed = (await cookies()).get("lt_nav")?.value === "1";
  // в шапке нужен только счётчик непрочитанных уведомлений (один лёгкий запрос параллельно с контекстом); список и «что горит» колокольчик подгружает при открытии
  const [c, unread] = await Promise.all([requireCtx(), sess ? unreadCount(sess.uid) : Promise.resolve(0)]);
  // заводы для подпапки «Заводы» в меню: короткий запрос по индексу организации
  const factories = await q<{ id: string; name: string }>("select id,name from kz_factories where org_id=$1 order by created_at desc limit 15", [c.org.id]).catch(() => []);
  return (
    <>
      <ThemeSync theme={c.user.theme} />
      <PendingBar /><Suspense fallback={null}><NavProgress /></Suspense>
      <AppShell factories={factories} orgs={c.orgs} orgId={c.org.id} userName={c.user.name} email={c.user.email} userId={c.user.id} avatarV={c.user.avatarV} isAdmin={c.isAdmin} free={c.org.plan === "free" && !c.org.unlimited} initialCollapsed={navCollapsed}
        balance={rub(c.org.balance_kop)} unlimited={c.org.unlimited} planName={c.org.unlimited ? "Админ · без ограничений" : PLANS[c.org.plan].name} unread={c.user.guest ? 0 : unread} role={c.org.role} guest={c.user.guest}>
        {children}
      </AppShell>
    </>
  );
}
