"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useRole } from "./RoleContext";

const TABS = [
  { href: "/app/factories", label: "Заводы", test: (p: string) => p.startsWith("/app/factories") },
  { href: "/app/brands", label: "Бренды", test: (p: string) => p.startsWith("/app/brands") && !p.endsWith("/knowledge") },
  { href: "/app/knowledge", label: "База знаний", test: (p: string) => p === "/app/knowledge" || p.endsWith("/knowledge") },
  { href: "/app/team", label: "Пользователи", test: (p: string) => p.startsWith("/app/team") },
];

/** Полоса вкладок над страницей: заводы, бренды, база знаний (брендбук), команда. Справа — главное действие страницы. */
export function OrgTabs({ action }: { action?: React.ReactNode }) {
  const path = usePathname();
  const { role } = useRole();
  const tabs = role === "viewer" ? TABS.slice(0, 1) : TABS;
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10">
      <nav className="no-scrollbar -mb-px flex min-w-0 overflow-x-auto">
        {tabs.map((t) => {
          const on = t.test(path);
          return <Link key={t.href} href={t.href} className={clsx("relative flex h-12 items-center whitespace-nowrap px-2.5 text-base font-medium transition-colors", on ? "text-ink" : "text-ink/70 hover:text-ink")}>
            {t.label}{on && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
          </Link>;
        })}
      </nav>
      {action && <div className="flex shrink-0 items-center gap-2 pb-1.5">{action}</div>}
    </div>
  );
}
