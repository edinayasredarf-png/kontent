"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

const TABS = [["create", "Создание контента"], ["plan", "Контент-план"], ["settings", "Настройки контента"]] as const;

/** Вкладки завода: выбранная вкладка подсвечивается сразу при нажатии, пока сервер готовит содержимое, рядом крутится индикатор. */
export function FactoryTabs({ factoryId, tab }: { factoryId: string; tab: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [opt, setOpt] = useState<string | null>(null);
  useEffect(() => { if (!pending) setOpt(null); }, [pending, tab]);
  const active = opt ?? tab;
  return (
    <nav className="inline-flex max-w-full items-center overflow-x-auto rounded-full bg-tile p-1 text-sm no-scrollbar">
      {TABS.map(([k, l]) => (
        <Link key={k} href={`/app/factories/${factoryId}?tab=${k}`} prefetch
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); if (k === tab) return; setOpt(k); start(() => router.push(`/app/factories/${factoryId}?tab=${k}`)); }}
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 transition ${active === k ? "bg-surface font-semibold shadow-sm" : "text-ink2 hover:text-ink"}`}>
          {pending && opt === k && <Loader2 size={14} className="animate-spin text-accent" />}{l}
        </Link>
      ))}
    </nav>
  );
}
