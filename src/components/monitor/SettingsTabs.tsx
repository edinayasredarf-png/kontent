"use client";
import { useState } from "react";

/** Вкладки настроек: все панели остаются в разметке (формы не теряют введённое при переключении), показывается одна. */
export function SettingsTabs({ tabs }: { tabs: { key: string; label: string; badge?: string; node: React.ReactNode }[] }) {
  const [cur, setCur] = useState(tabs[0]?.key);
  return (
    <div>
      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={cur === t.key} onClick={() => setCur(t.key)}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${cur === t.key ? "bg-accent text-white" : "bg-accent-soft text-ink hover:bg-tile2"}`}>
            {t.label}{t.badge && <span className={`rounded-full px-1.5 text-[11px] leading-5 ${cur === t.key ? "bg-white/25" : "bg-surface"}`}>{t.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => <div key={t.key} role="tabpanel" hidden={cur !== t.key} className="space-y-4">{t.node}</div>)}
    </div>
  );
}
