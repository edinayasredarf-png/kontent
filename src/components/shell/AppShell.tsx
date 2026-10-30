"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import clsx from "clsx";
import { Bell, ChevronDown, HelpCircle, LogOut, Menu, PanelLeft, Plus, Wallet, X } from "lucide-react";
import { Logo } from "../Logo";
import { Search } from "./Search";
import { ThemeToggle } from "./ThemeToggle";
import { NAV, type NavItem } from "./nav";
import { RoleProvider, READONLY_HINT } from "./RoleContext";
import { NotificationBell } from "./NotificationBell";
import { Eye } from "lucide-react";
import { logoutAction, switchOrgAction } from "@/lib/actions";
import { SubmitButton } from "../SubmitButton";
import { Avatar } from "../Avatar";
import { ScrollKeeper } from "../ScrollKeeper";
import { sweepDrafts } from "@/lib/draft-store";

export interface ShellProps {
  orgs: { id: string; name: string }[]; orgId: string; userName: string; email: string; userId: string; avatarV: number | null; isAdmin: boolean;
  free: boolean; factories: { id: string; name: string }[]; initialCollapsed?: boolean; balance: string; unlimited: boolean; planName: string; unread: number; role: string; guest: boolean; children: React.ReactNode;
}


const VIEWER_HIDE = ["/app/studio", "/app/channels", "/app/create", "/app/billing", "/app/team", "/app/brands"];

/** Оболочка кабинета: плоское меню с подпапками слева, белая «страница» со скруглением справа, действия (поиск, помощь, уведомления, баланс) над ней. */
export function AppShell(p: ShellProps) {
  const path = usePathname();
  // состояние меню приходит с сервера из cookie: так первая отрисовка сразу правильной ширины, без «прыжка» после загрузки
  const [collapsed, setCollapsed] = useState(!!p.initialCollapsed), [drawer, setDrawer] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({}), [opened, setOpened] = useState<Record<string, boolean>>({});
  useEffect(() => { sweepDrafts(); }, []);
  useEffect(() => { setDrawer(false); }, [path]);
  const toggle = () => setCollapsed((c) => { try { document.cookie = `lt_nav=${c ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`; } catch { /* ок */ } return !c; });
  const slim = collapsed && !drawer;
  const viewer = p.role === "viewer";
  // наблюдателю нет ассистента, ИИ-инструментов и подключений: вместо чата — сводка
  const nav: NavItem[] = viewer
    ? NAV.filter((n) => !VIEWER_HIDE.includes(n.href)).map((n) => (n.href === "/app" ? { ...n, href: "/app/overview", label: "Сводка", exact: false } : { ...n, children: n.children?.filter((c) => !VIEWER_HIDE.includes(c.href) && !(p.guest && c.href === "/app/profile")) }))
    : NAV;
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
  const here = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));

  const row = "relative flex h-12 items-center rounded-2xl text-base font-medium text-ink transition-colors";
  const sidebar = (
    <aside className={clsx("flex flex-col overflow-hidden transition-[width] duration-200",
      "fixed bottom-0 left-0 top-0 z-40 w-[300px] max-w-[86vw] bg-surface shadow-float max-md:rounded-r-[20px] md:bg-transparent md:shadow-none", drawer ? "translate-x-0" : "-translate-x-full md:translate-x-0", slim ? "md:w-[88px]" : "md:w-72")}>
      <div className={clsx("flex shrink-0 items-start px-4 py-5", slim ? "justify-center" : "justify-between")}>
        {slim ? <PanelBtn onClick={toggle} label="Развернуть меню" /> : <><Logo h={32} /><span className="hidden md:block"><PanelBtn onClick={toggle} label="Свернуть меню" /></span><button type="button" onClick={() => setDrawer(false)} aria-label="Закрыть меню" className="md:hidden"><X size={20} /></button></>}
      </div>
      {!slim && p.orgs.length > 1 && (
        <form action={switchOrgAction} data-allow-readonly className="px-4 pb-2">
          <select name="org" defaultValue={p.orgId} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="input !rounded-full !bg-surface !py-2">{p.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </form>
      )}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4 pt-3">
        {nav.map((n) => {
          const Icon = n.icon;
          const kids = n.factories ? p.factories.map((f) => ({ href: `/app/factories/${f.id}`, label: f.name })) : n.children ?? [];
          const hasKids = !slim && (kids.length > 0 || !!n.factories);
          const inside = here(n.href, n.exact) || kids.some((k) => here(k.href));
          const open = hasKids && (opened[n.href] ?? (inside && !closed[n.href]));
          const pro = n.pro && p.free;
          return (
            <div key={n.href}>
              <div className={clsx(row, slim ? "justify-center" : "gap-4 pl-5 pr-2", open || (inside && !hasKids) ? "bg-ink/[.07]" : "hover:bg-ink/[.04]")}>
                <Link href={n.href} title={slim ? n.label : undefined} className={clsx("flex h-full min-w-0 items-center", slim ? "justify-center" : "flex-1 gap-4")}>
                  <Icon size={20} strokeWidth={1.7} className={clsx("shrink-0", inside ? "text-accent" : "text-ink2")} />
                  {!slim && <span className="flex-1 truncate">{n.label}</span>}
                  {!slim && pro && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">PRO</span>}
                </Link>
                {hasKids && <button type="button" aria-label={open ? "Свернуть" : "Развернуть"} aria-expanded={open} onClick={() => { if (open) { setOpened((o) => ({ ...o, [n.href]: false })); setClosed((c) => ({ ...c, [n.href]: true })); } else { setOpened((o) => ({ ...o, [n.href]: true })); setClosed((c) => ({ ...c, [n.href]: false })); } }} className="grid size-9 shrink-0 place-items-center rounded-xl text-ink2 hover:text-ink"><ChevronDown size={16} className={clsx("transition-transform", open && "rotate-180")} /></button>}
              </div>
              {open && (
                <div className="mb-1 mt-0.5 space-y-0.5 pl-[3.25rem] pr-1">
                  {kids.map((k) => <Link key={k.href} href={k.href} className={clsx("flex h-9 items-center truncate rounded-xl px-3 text-[15px] transition-colors", here(k.href) ? "font-semibold text-accent" : "text-ink2 hover:text-ink")}><span className="truncate">{k.label}</span></Link>)}
                  {n.factories && !viewer && <Link href="/app/factories/new" className="mt-1.5 flex h-8 items-center justify-between rounded-lg bg-ink2/80 pl-3 pr-1.5 text-xs font-medium text-white hover:bg-ink2">Создать завод<span className="grid size-5 place-items-center rounded-full bg-white text-ink2"><Plus size={13} strokeWidth={2.5} /></span></Link>}
                </div>)}
            </div>
          );
        })}
      </nav>
      {!slim && p.free && (
        <div className="relative mx-5 mb-4 mt-10 shrink-0 rounded-2xl bg-accent px-5 pb-5 pt-12 text-center text-white max-md:hidden" style={{ boxShadow: "0 21px 27px -10px rgba(0,112,240,.45)" }}>
          <span className="absolute -top-10 left-1/2 grid size-20 -translate-x-1/2 place-items-center rounded-full border-4 border-white bg-accent shadow-soft dark:border-[var(--bg)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark-white.svg" alt="" className="size-9" />
          </span>
          <b className="block text-lg font-semibold">Выберите тариф</b>
          <p className="mt-2 text-sm font-semibold leading-6">Баланс: {p.balance}. Подключите тариф, чтобы снять ограничения.</p>
          <Link href="/app/billing" className="mt-4 block rounded-full bg-white/15 py-2.5 text-sm font-semibold hover:bg-white/25">Подключить тариф</Link>
        </div>
      )}
      <form action={logoutAction} data-allow-readonly className={clsx("shrink-0 pb-4", slim ? "px-3" : "px-5")}>
        <div className="border-t border-ink/10" />
        <div className={clsx("flex items-center pt-3", slim ? "justify-center" : "justify-between gap-2 px-0.5")}>
          <Link href={p.guest ? "/app/overview" : "/app/profile"} title={p.guest ? "Гостевой доступ" : "Профиль и безопасность"} className="flex min-w-0 items-center gap-3">
            <Avatar id={p.userId} v={p.avatarV} name={p.userName} email={p.email} className="size-10" />
            {!slim && <span className="truncate text-base font-semibold">{p.userName || p.email}</span>}
          </Link>
          {!slim && <SubmitButton allowReadOnly title="Выйти" aria-label="Выйти" className="grid size-9 shrink-0 place-items-center rounded-full text-ink2 hover:bg-ink/[.06] hover:text-ink"><LogOut size={16} /></SubmitButton>}
        </div>
      </form>
    </aside>
  );

  return (
    <RoleProvider value={{ role: p.role, guest: p.guest }}>
    <div className="min-h-screen bg-[var(--bg)]">
      <Suspense fallback={null}><ScrollKeeper /></Suspense>
      {sidebar}
      {drawer && <button type="button" aria-label="Закрыть меню" onClick={() => setDrawer(false)} className="fixed inset-0 z-30 bg-black/30 md:hidden" />}
      <div className={clsx("flex min-h-screen flex-col transition-[padding] duration-200", slim ? "md:pl-[88px]" : "md:pl-72")}>
        <header className="flex h-[72px] shrink-0 items-center gap-2 px-4 md:pr-5">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Открыть меню" className="grid size-10 place-items-center rounded-full text-ink md:hidden"><Menu size={22} /></button>
          <div className="ml-auto flex items-center gap-1">
            <Search />
            {!p.guest && <Link href={`/app/help?from=${encodeURIComponent(path)}`} aria-label="Помощь" title="Помощь и поддержка" className="grid size-10 place-items-center rounded-full text-ink2 hover:bg-ink/[.06]"><HelpCircle size={20} /></Link>}
            {p.guest ? <Link href="/app/overview" aria-label="Что требует внимания" className="relative grid size-10 place-items-center rounded-full text-ink2 hover:bg-ink/[.06]"><Bell size={20} /></Link> : <NotificationBell unread={p.unread} />}
            <ThemeToggle />
            {!viewer && <Link href="/app/billing" title="Баланс и тариф" className="flex h-10 items-center gap-2 rounded-full px-2.5 text-sm font-semibold text-ink2 hover:bg-ink/[.06]"><Wallet size={20} /><span>{p.unlimited ? "∞" : p.balance}</span></Link>}
          </div>
        </header>
        <div className="flex-1 px-2 pb-2 md:pl-3 md:pr-5 md:pb-3.5">
          <div className="min-h-[calc(100vh-92px)] rounded-[20px] bg-surface px-5 py-6 md:px-12 md:py-9">
            {viewer && <div className="mb-5"><div className="mx-auto flex max-w-[1280px] items-center gap-2 rounded-2xl bg-accent-soft px-4 py-2.5 text-sm text-ink"><Eye size={16} className="shrink-0 text-accent" /><span>{p.guest ? "Гостевой доступ: можно смотреть, изменять нельзя." : "Режим просмотра: ваша роль «Наблюдатель», изменять данные нельзя."}</span></div></div>}
            <main>{title && <h1 className="mb-2 text-4xl font-semibold leading-8 text-ink max-md:text-[28px]">{title}</h1>}<div className="mx-auto max-w-[1280px]">{p.children}</div></main>
          </div>
        </div>
      </div>
    </div>
    </RoleProvider>
  );
}

function PanelBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="grid size-8 place-items-center rounded-xl text-ink2 hover:bg-ink/[.06] hover:text-ink"><PanelLeft size={20} /></button>;
}
