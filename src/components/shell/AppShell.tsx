"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Bell, LogOut, Menu, PanelLeft, Settings, Wallet, X } from "lucide-react";
import { Logo } from "../Logo";
import { Search } from "./Search";
import { ThemeToggle } from "./ThemeToggle";
import { NAV } from "./nav";
import { logoutAction, switchOrgAction } from "@/lib/actions";
import { SubmitButton } from "../SubmitButton";

export interface ShellProps {
  orgs: { id: string; name: string }[]; orgId: string; userName: string; email: string; isAdmin: boolean;
  free: boolean; balance: string; unlimited: boolean; planName: string; alerts: number; children: React.ReactNode;
}

const initials = (n: string, e: string) => (n.trim()[0] ?? e[0] ?? "?").toUpperCase();

/** Оболочка кабинета: плавающее меню слева, шапка с поиском и быстрыми действиями, на телефоне меню выезжает поверх страницы. */
export function AppShell(p: ShellProps) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false), [drawer, setDrawer] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("lt_nav") === "1"); } catch { /* без запоминания */ } }, []);
  useEffect(() => { setDrawer(false); }, [path]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("lt_nav", c ? "0" : "1"); } catch { /* ок */ } return !c; });
  const slim = collapsed && !drawer;
  const title = path === "/app" ? "Чат" : "";

  const sidebar = (
    <aside className={clsx("flex flex-col overflow-hidden bg-surface shadow-float transition-[width] duration-200",
      "fixed bottom-0 left-0 top-0 z-40 w-[300px] max-w-[86vw] rounded-r-[20px] md:bottom-5 md:left-5 md:top-[30px] md:max-w-none md:rounded-[20px]",
      drawer ? "translate-x-0" : "-translate-x-full md:translate-x-0", slim ? "md:w-[88px]" : "md:w-80")}>
      <div className={clsx("flex h-[118px] shrink-0 items-center border-b border-line", slim ? "justify-center" : "justify-between pl-10 pr-6")}>
        {slim ? <PanelBtn onClick={toggle} label="Развернуть меню" /> : <><Logo h={44} /><span className="hidden md:block"><PanelBtn onClick={toggle} label="Свернуть меню" /></span><button type="button" onClick={() => setDrawer(false)} aria-label="Закрыть меню" className="md:hidden"><X size={20} /></button></>}
      </div>
      {!slim && p.orgs.length > 1 && (
        <form action={switchOrgAction} className="px-6 pt-4">
          <select name="org" defaultValue={p.orgId} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="input !rounded-full !py-2">{p.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </form>
      )}
      <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-6">
        {NAV.map(({ href, label, icon: Icon, ...rest }) => {
          const on = "exact" in rest && rest.exact ? path === href : path.startsWith(href);
          const pro = "pro" in rest && rest.pro && p.free;
          return (
            <Link key={href} href={href} title={slim ? label : undefined}
              className={clsx("relative flex h-12 items-center rounded-2xl text-base font-semibold transition-colors", slim ? "justify-center" : "gap-4 pl-5 pr-4", on ? "bg-accent-soft text-ink" : "text-ink hover:bg-accent-soft/70")}>
              <Icon size={20} strokeWidth={1.8} className={clsx("shrink-0", on ? "text-accent" : "text-ink/80")} />
              {!slim && <span className="flex-1 truncate">{label}</span>}
              {!slim && pro && <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">PRO</span>}
            </Link>
          );
        })}
      </nav>
      {!slim && p.free && (
        <div className="relative mx-6 mb-5 mt-6 shrink-0 rounded-2xl px-6 pb-6 pt-12 text-center text-white" style={{ background: "linear-gradient(285deg, #4d63ff, #1734fc 70%)", boxShadow: "0 21px 27px -10px rgba(96,60,255,.48)" }}>
          <span className="absolute -top-10 left-1/2 grid size-20 -translate-x-1/2 place-items-center rounded-full border-4 border-white" style={{ background: "linear-gradient(285deg, #4d63ff, #1734fc 70%)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark-white.svg" alt="" className="size-9" />
          </span>
          <b className="block text-lg font-semibold">Выберите тариф</b>
          <p className="mt-3 text-sm font-semibold leading-6">Баланс: {p.balance}. Подключите тариф, чтобы снять ограничения и подключить больше брендов и заводов.</p>
          <Link href="/app/billing" className="mt-4 block rounded-full bg-white/15 py-2.5 text-sm font-semibold hover:bg-white/25">Подключить тариф</Link>
        </div>
      )}
      <form action={logoutAction} className={clsx("mb-5 shrink-0", slim ? "px-3" : "px-6")}>
        <div className={clsx("flex items-center rounded-[30px] bg-surface p-3 shadow-soft", slim ? "justify-center" : "justify-between")}>
          <Link href="/app/profile" title="Профиль и безопасность" className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-white">{initials(p.userName, p.email)}</span>
            {!slim && <span className="truncate text-sm font-semibold">{p.userName || p.email}</span>}
          </Link>
          {!slim && <SubmitButton title="Выйти" aria-label="Выйти" className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink hover:bg-accent-soft"><LogOut size={14} /></SubmitButton>}
        </div>
      </form>
    </aside>
  );

  return (
    <div className="min-h-screen">
      {sidebar}
      {drawer && <button type="button" aria-label="Закрыть меню" onClick={() => setDrawer(false)} className="fixed inset-0 z-30 bg-black/30 md:hidden" />}
      <div className={clsx("min-h-screen transition-[padding] duration-200", slim ? "md:pl-[140px]" : "md:pl-[372px]")}>
        <header className="flex items-center gap-3 px-5 pb-2 pt-4 md:px-10 md:pt-[57px]">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Открыть меню" className="grid size-10 place-items-center rounded-full bg-accent-soft md:hidden"><Menu size={20} /></button>
          <h1 className="text-[28px] font-semibold leading-8 text-ink md:text-4xl">{title}</h1>
          <div className="ml-auto flex items-center gap-1.5 rounded-[30px] bg-surface py-2 pl-3 pr-2 shadow-soft md:gap-3 md:pl-5">
            <Search />
            <Link href="/app/overview" aria-label="Что требует внимания" title="Что требует внимания" className="relative grid size-10 place-items-center rounded-full text-ink2 hover:bg-accent-soft"><Bell size={20} />{p.alerts > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-4 text-white">{p.alerts > 9 ? "9+" : p.alerts}</span>}</Link>
            <ThemeToggle />
            <Link href="/app/billing" title="Баланс и тариф" className="flex h-10 items-center gap-2 rounded-full px-2 text-sm font-semibold text-ink2 hover:bg-accent-soft"><Wallet size={20} /><span className="hidden lg:inline">{p.unlimited ? "∞" : p.balance}</span></Link>
            <Link href="/app/settings" aria-label="Настройки" title="Настройки" className="grid size-10 place-items-center rounded-full text-ink2 hover:bg-accent-soft"><Settings size={20} /></Link>
            <Link href="/app/profile" aria-label="Профиль" title={p.planName} className="grid size-10 place-items-center rounded-full bg-accent text-sm font-semibold text-white">{initials(p.userName, p.email)}</Link>
          </div>
        </header>
        {/* при свёрнутой панели слева резервируется 140 px, поэтому справа даём столько же: колонки по центру стоят по центру окна, а не смещены вправо */}
        <main className={clsx("px-5 pb-10 pt-4 md:px-10", slim && "lg:pr-[180px]")}><div className="mx-auto max-w-[1280px]">{p.children}</div></main>
      </div>
    </div>
  );
}

function PanelBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="grid size-10 place-items-center rounded-xl text-accent hover:bg-accent-soft"><PanelLeft size={20} /></button>;
}
