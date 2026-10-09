"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Factory, LayoutDashboard, Building2, Send, Radio, Wand2, Wallet, LogOut, Cpu, Radar, CalendarDays, UsersRound, Gift, UserRound, BarChart3, Inbox, Sparkles } from "lucide-react";
import clsx from "clsx";
import { logoutAction, switchOrgAction } from "@/lib/actions";

const NAV = [
  { href: "/app", label: "Обзор", icon: LayoutDashboard, exact: true },
  { href: "/app/factories", label: "Заводы", icon: Factory },
  { href: "/app/brands", label: "Бренды", icon: Building2 },
  { href: "/app/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/app/monitor", label: "Мониторинг", icon: Radar },
  { href: "/app/publications", label: "Публикации", icon: Send },
  { href: "/app/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/app/inbox", label: "Входящие", icon: Inbox },
  { href: "/app/channels", label: "Каналы", icon: Radio },
  { href: "/app/assistant", label: "Лия", icon: Sparkles },
  { href: "/app/studio", label: "Студия и агенты", icon: Wand2 },
  { href: "/app/billing", label: "Баланс и тариф", icon: Wallet },
  { href: "/app/team", label: "Команда", icon: UsersRound },
  { href: "/app/partners", label: "Партнёрка", icon: Gift },
  { href: "/app/profile", label: "Профиль", icon: UserRound },
];

export function Sidebar({ orgs, orgId, user, isAdmin }: { orgs: { id: string; name: string }[]; orgId: string; user: string; isAdmin: boolean }) {
  const path = usePathname();
  const items = isAdmin ? [...NAV, { href: "/app/settings", label: "Настройки ИИ", icon: Cpu }] : NAV;
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-line bg-white md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="grid size-9 place-items-center rounded-xl bg-accent text-white"><Factory size={18} /></span>
        <div className="leading-tight"><b className="block text-[15px]">Контент-завод</b><span className="text-xs text-ink3">Единая среда</span></div>
      </div>
      {orgs.length > 1 && (
        <form action={switchOrgAction} className="px-4 pb-2">
          <select name="org" defaultValue={orgId} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="input !py-2">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </form>
      )}
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
        {items.map(({ href, label, icon: Icon, exact }: { href: string; label: string; icon: typeof Cpu; exact?: boolean }) => {
          const on = exact ? path === href : path.startsWith(href);
          return (
            <Link key={href} href={href} className={clsx("flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition", on ? "bg-tile font-medium text-ink" : "text-ink2 hover:bg-tile/60")}>
              <Icon size={18} className={on ? "text-accent" : ""} />{label}
            </Link>
          );
        })}
      </nav>
      <form action={logoutAction} className="hidden items-center justify-between border-t border-line px-5 py-3 md:flex">
        <Link href="/app/profile" className="truncate text-xs text-ink2 hover:text-ink" title="Профиль и безопасность">{user}</Link>
        <button title="Выйти" className="text-ink3 hover:text-ink"><LogOut size={16} /></button>
      </form>
    </aside>
  );
}
