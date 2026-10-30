"use client";
import { useEffect, useState, useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme } from "../ThemePicker";
import { setThemeAction } from "@/lib/account-actions";

/** Быстрое переключение светлой и тёмной темы; выбор сохраняется в аккаунте. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [, start] = useTransition();
  useEffect(() => { const r = document.documentElement; setDark(r.getAttribute("data-theme") === "dark" || (!r.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches)); }, []);
  const flip = () => { const next = dark ? "light" : "dark"; setDark(!dark); applyTheme(next); start(async () => { await setThemeAction(next); }); };
  return <button type="button" onClick={flip} aria-label={dark ? "Светлая тема" : "Тёмная тема"} title={dark ? "Светлая тема" : "Тёмная тема"} className="grid size-10 place-items-center rounded-full text-ink2 hover:bg-ink/[.06]">{dark ? <Sun size={20} /> : <Moon size={20} />}</button>;
}
