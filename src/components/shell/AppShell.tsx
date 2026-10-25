"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import clsx from "clsx";
import { Bell, HelpCircle, LogOut, Menu, PanelLeft, Settings, Wallet, X } from "lucide-react";
import { Logo } from "../Logo";
import { Search } from "./Search";
import { ThemeToggle } from "./ThemeToggle";
import { NAV } from "./nav";
import { RoleProvider, READONLY_HINT } from "./RoleContext";
import { NotificationBell } from "./NotificationBell";
import type { Notification } from "@/lib/notify";
import { Eye } from "lucide-react";
import { logoutAction, switchOrgAction } from "@/lib/actions";
import { SubmitButton } from "../SubmitButton";
import { Avatar } from "../Avatar";
import { ScrollKeeper } from "../ScrollKeeper";
import { sweepDrafts } from "@/lib/draft-store";

export interface ShellProps {
  orgs: { id: string; name: string }[]; orgId: string; userName: string; email: string; userId: string; avatarV: number | null; isAdmin: boolean;
  free: boolean; initialCollapsed?: boolean; balance: string; unlimited: boolean; planName: string; alerts: number; notes: Notification[]; unread: number; role: string; guest: boolean; children: React.ReactNode;
}


/** Оболочка кабинета: плавающее меню слева, шапка с поиском и быстрыми действиями, на телефоне меню выезжает поверх страницы. */
export function AppShell(p: ShellProps) {
  const path = usePathname();
  // состояние меню приходит с сервера из cookie: так первая отрисовка сразу правильной ширины, без «прыжка» после загрузки
  const [collapsed, setCollapsed] = useState(!!p.initialCollapsed), [drawer, setDrawer] = useState(false);
  useEffect(() => { sweepDrafts(); }, []);
  useEffect(() => { setDrawer(false); }, [path]);
  const toggle = () => setCollapsed((c) => { try { document.cookie = `lt_nav=${c ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`; } catch { /* ок */ } return !c; });
  const slim = collapsed && !drawer;
  const viewer = p.role === "viewer";
  // наблюдателю нет ассистента, ИИ-инструментов и подключений: вместо чата — сводка
  const nav = viewer ? NAV.filter((n) => !["/app/studio", "/app/channels"].includes(n.href)).map((n) => (n.href === "/app" ? { ...n, href: "/app/overview", label: "Сводка", exact: false } : n)) : NAV;
  // запасная защита: даже если какая-то форма не знает про роль, отправка из режима просмотра не уйдёт на сервер
  useEffect(() => {
    if (!viewer) return;
    const stop = (e: Event) => {
      const f = e.target as HTMLFormElement;
      if (f?.tagName !== "FORM" || (f.getAttribute("method") ?? "").toLowerCase() === "get" || f.hasAttribute("data-allow-readonly")) return;
      e.preventDefault(); e.stopPropagation(); alert(READONLY_HINT);
    };
    document.addEventListener("submit", stop, true);
    // кнопки действий, которые вызывают сервер напрямую (ИИ-панели, редакторы): блокируем и подсказываем причину
    const SEL = "main button.btn-accent, main button.btn-ghost, main button[type=submit]";
    const sweep = () => document.querySelectorAll<HTMLButtonElement>(SEL).forEach((b) => {
      if (b.dataset.roChecked || b.closest("[data-allow-readonly]") || b.closest("[role=dialog] [data-close]")) return;
      b.dataset.roChecked = "1";
      if ((b.form?.getAttribute("method") ?? "").toLowerCase() === "get") return;
      b.disabled = true; b.title = READONLY_HINT; b.setAttribute("aria-disabled", "true");
    });
    sweep();
    const mo = new MutationObserver(sweep);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { document.removeEventListener("submit", stop, true); mo.disconnect(); };
  }, [viewer]);
  const title = path === "/app" ? "Чат" : "";

  const sidebar = (
    <aside className={clsx("flex flex-col overflow-hidden bg-surface shadow-float transition-[width] duration-200",
      "fixed bottom-0 left-0 top-0 z-40 w-[300px] max-w-[86vw] rounded-r-[20px] md:bottom-5 md:left-5 md:top-[30px] md:max-w-none md:rounded-[20px]",
      drawer ? "translate-x-0" : "-translate-x-full md:translate-x-0", slim ? "md:w-[88px]" : "md:w-80")}>
      <div className={clsx("flex h-[118px] shrink-0 items-center border-b border-line", slim ? "justify-center" : "justify-between pl-10 pr-6")}>
        {slim ? <PanelBtn onClick={toggle} label="Развернуть меню" /> : <><Logo h={44} /><span className="hidden md:block"><PanelBtn onClick={toggle} label="Свернуть меню" /></span><button type="button" onClick={() => setDrawer(false)} aria-label="Закрыть меню" className="md:hidden"><X size={20} /></button></>}
      </div>
      {!slim && p.orgs.length > 1 && (
        <form action={switchOrgAction} data-allow-readonly className="px-6 pt-4">
          <select name="org" defaultValue={p.orgId} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="input !rounded-full !py-2">{p.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </form>
      )}
      <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-6">
        {nav.map(({ href, label, icon: Icon, ...rest }) => {
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
        <div className="relative mx-6 mb-5 mt-6 shrink-0 rounded-2xl px-6 pb-6 pt-12 text-center text-white max-md:hidden" style={{ background: "linear-gradient(285deg, #4d63ff, #1734fc 70%)", boxShadow: "0 21px 27px -10px rgba(96,60,255,.48)" }}>
          <span className="absolute -top-10 left-1/2 grid size-20 -translate-x-1/2 place-items-center rounded-full border-4 border-white" style={{ background: "linear-gradient(285deg, #4d63ff, #1734fc 70%)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark-white.svg" alt="" className="size-9" />
          </span>
          <b className="block text-lg font-semibold">Выберите тариф</b>
          <p className="mt-3 text-sm font-semibold leading-6">Баланс: {p.balance}. Подключите тариф, чтобы снять ограничения и подключить больше брендов и заводов.</p>
          <Link href="/app/billing" className="mt-4 block rounded-full bg-white/15 py-2.5 text-sm font-semibold hover:bg-white/25">Подключить тариф</Link>
        </div>
      )}
      <form action={logoutAction} data-allow-readonly className={clsx("mb-5 shrink-0", slim ? "px-3" : "px-6")}>
        <div className={clsx("flex items-center rounded-[30px] bg-surface p-3 shadow-soft", slim ? "justify-center" : "justify-between")}>
          <Link href={p.guest ? "/app/overview" : "/app/profile"} title={p.guest ? "Гостевой доступ" : "Профиль и безопасность"} className="flex min-w-0 items-center gap-3">
            <Avatar id={p.userId} v={p.avatarV} name={p.userName} email={p.email} className="size-8" />
            {!slim && <span className="truncate text-sm font-semibold">{p.userName || p.email}</span>}
          </Link>
          {!slim && <SubmitButton allowReadOnly title="Выйти" aria-label="Выйти" className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink hover:bg-accent-soft"><LogOut size={14} /></SubmitButton>}
        </div>
      </form>
    </aside>
  );

  return (
    <RoleProvider value={{ role: p.role, guest: p.guest }}>
    <div className="min-h-screen">
      <Suspense fallback={null}><ScrollKeeper /></Suspense>
      {sidebar}
      {drawer && <button type="button" aria-label="Закрыть меню" onClick={() => setDrawer(false)} className="fixed inset-0 z-30 bg-black/30 md:hidden" />}
      <div className={clsx("min-h-screen transition-[padding] duration-200", slim ? "md:pl-[108px]" : "md:pl-[340px]")}>
        <header className="flex items-center gap-3 px-5 pb-2 pt-4 md:px-10 md:pt-[57px]">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Открыть меню" className="grid size-10 place-items-center rounded-full bg-accent-soft md:hidden"><Menu size={20} /></button>
          <h1 className="text-[28px] font-semibold leading-8 text-ink md:text-4xl">{title}</h1>
          <div className="ml-auto flex items-center gap-1.5 rounded-[30px] bg-surface py-2 pl-3 pr-2 shadow-soft md:gap-3 md:pl-5">
            <Search />
            {!p.guest && <Link href={`/app/help?from=${encodeURIComponent(path)}`} aria-label="Помощь" title="Помощь и поддержка" className="grid size-10 place-items-center rounded-full text-ink2 hover:bg-accent-soft"><HelpCircle size={20} /></Link>}
            {p.guest ? <Link href="/app/overview" aria-label="Что требует внимания" className="relative grid size-10 place-items-center rounded-full text-ink2 hover:bg-accent-soft"><Bell size={20} /></Link> : <NotificationBell initial={p.notes} unread={p.unread} alerts={p.alerts} />}
            <ThemeToggle />
            {!viewer && <Link href="/app/billing" title="Баланс и тариф" className="flex h-10 items-center gap-2 rounded-full px-2 text-sm font-semibold text-ink2 hover:bg-accent-soft"><Wallet size={20} /><span className="hidden lg:inline">{p.unlimited ? "∞" : p.balance}</span></Link>}
            <Link href="/app/settings" aria-label="Настройки" title="Настройки" className="grid size-10 place-items-center rounded-full text-ink2 hover:bg-accent-soft"><Settings size={20} /></Link>
            <Link href={p.guest ? "/app/overview" : "/app/profile"} aria-label="Профиль" title={p.planName} className="rounded-full"><Avatar id={p.userId} v={p.avatarV} name={p.userName} email={p.email} className="size-10" /></Link>
          </div>
        </header>
        {/* область начинается ровно у правого края меню (20 px поле + 88 или 320 px), поэтому расстояния от меню и от края окна до колонки равны */}
        {viewer && <div className="px-5 md:px-10"><div className="mx-auto flex max-w-[1280px] items-center gap-2 rounded-2xl bg-accent-soft px-4 py-2.5 text-sm text-ink"><Eye size={16} className="shrink-0 text-accent" /><span>{p.guest ? "Гостевой доступ: можно смотреть, изменять нельзя." : "Режим просмотра: ваша роль «Наблюдатель», изменять данные нельзя."}</span></div></div>}
        <main className="px-5 pb-10 pt-4 md:px-10"><div className="mx-auto max-w-[1280px]">{p.children}</div></main>
      </div>
    </div>
    </RoleProvider>
  );
}

function PanelBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="grid size-10 place-items-center rounded-xl text-accent hover:bg-accent-soft"><PanelLeft size={20} /></button>;
}
