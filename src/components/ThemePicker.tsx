"use client";
import { useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { setThemeAction } from "@/lib/account-actions";

export type Theme = "light" | "dark" | "system";

/** Применяет тему сразу в браузере: data-theme для явного выбора, для «как в системе» атрибут снимается и работает prefers-color-scheme. */
export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  document.cookie = `lt_theme=${t}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}

const OPTIONS: { key: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { key: "light", label: "Светлая", hint: "Всегда светлое оформление", icon: Sun },
  { key: "dark", label: "Тёмная", hint: "Всегда тёмное оформление", icon: Moon },
  { key: "system", label: "Как в системе", hint: "Следует настройке устройства", icon: Monitor },
];

export function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const pick = (t: Theme) => {
    if (t === theme) return;
    const prev = theme; setTheme(t); setErr(""); applyTheme(t);
    // сохраняем в аккаунте, чтобы тема совпадала на всех устройствах; при сбое возвращаем прежнюю
    start(async () => { const r = await setThemeAction(t); if (r?.error) { setErr(r.error); setTheme(prev); applyTheme(prev); } });
  };
  return (
    <div>
      <div role="radiogroup" aria-label="Тема оформления" className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map(({ key, label, hint, icon: I }) => (
          <button key={key} type="button" role="radio" aria-checked={theme === key} disabled={pending} onClick={() => pick(key)}
            className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition ${theme === key ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-tile"}`}>
            <I size={20} className={theme === key ? "text-accent" : "text-ink2"} />
            <span className="text-sm font-medium">{label}</span><span className="text-xs text-ink3">{hint}</span>
          </button>
        ))}
      </div>
      {err && <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}
    </div>
  );
}
