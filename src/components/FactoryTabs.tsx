"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

const TABS = [["settings", "Завод"], ["content", "Контент"], ["plan", "Контент-план"], ["create", "Создание контента"]] as const;

/** Вкладки завода: выбранная вкладка подсвечивается сразу при нажатии, пока сервер готовит содержимое, рядом крутится индикатор. */
export function FactoryTabs({ factoryId, tab, drafts, canCreate }: { factoryId: string; tab: string; drafts: boolean; canCreate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [opt, setOpt] = useState<string | null>(null);
  useEffect(() => { if (!pending) setOpt(null); }, [pending, tab]);
  const active = opt ?? tab;
  return (
    <div className="space-y-3">
    <nav className="inline-flex max-w-full items-center overflow-x-auto rounded-full bg-tile p-1 text-sm no-scrollbar">
      {TABS.filter(([key]) => key !== "create" || canCreate).map(([k, l]) => (
        <Link key={k} href={`/app/factories/${factoryId}?tab=${k}`} prefetch
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); if (k === tab) return; setOpt(k); start(() => router.push(`/app/factories/${factoryId}?tab=${k}`)); }}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 transition ${active === k ? "bg-surface font-semibold shadow-sm" : "text-ink2 hover:text-ink"}`}>
          {pending && opt === k && <Loader2 size={14} className="animate-spin text-accent" />}{l}
        </Link>
      ))}
    </nav>
    {tab === "content" && <nav aria-label="Материалы завода" className="flex flex-wrap gap-2">
      {[["published", "Опубликованные"], ["drafts", "Черновики"]].map(([key, label]) => {
        const current = drafts === (key === "drafts");
        return <Link key={key} aria-current={current ? "page" : undefined} href={`/app/factories/${factoryId}?tab=content${key === "drafts" ? "&section=drafts" : ""}`} className={`rounded-full px-4 py-2 text-sm ${current ? "bg-accent-soft font-semibold text-accent-ink" : "text-ink2 hover:bg-tile"}`}>{label}</Link>;
      })}
    </nav>}
    </div>
  );
}
