"use client";
import { useEffect } from "react";
import { applyTheme, type Theme } from "./ThemePicker";

/** На новом устройстве cookie с темой ещё нет: подтягиваем сохранённую в аккаунте тему и применяем её. */
export function ThemeSync({ theme }: { theme: Theme }) {
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )lt_theme=(light|dark|system)/);
    if ((m?.[1] ?? "system") !== theme || !m) applyTheme(theme);
  }, [theme]);
  return null;
}
