"use client";
import { useEffect, useRef, useState } from "react";
import { loadMonitorSettings, type MonitorSettingsData } from "@/lib/monitor/settings";
import { SettingsContent } from "./SettingsContent";

export function LazySettings({ stamp }: { stamp: number }) {
  const [data, setData] = useState<MonitorSettingsData | null>(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const lastStamp = useRef(stamp);
  const request = useRef<Promise<MonitorSettingsData> | null>(null);
  useEffect(() => {
    let active = true;
    setError(false);
    if (lastStamp.current !== stamp) { request.current = null; lastStamp.current = stamp; }
    const pending = request.current ??= loadMonitorSettings();
    pending.then((value) => { if (active) setData(value); }, () => { request.current = null; if (active) setError(true); });
    return () => { active = false; };
  }, [attempt, stamp]);
  if (data) return <SettingsContent data={data} />;
  if (error) return <div role="alert" className="space-y-3"><p className="text-sm text-bad">Не удалось загрузить настройки.</p><button type="button" className="btn btn-ghost" onClick={() => setAttempt((n) => n + 1)}>Попробовать снова</button></div>;
  return <div aria-busy="true" aria-label="Загрузка настроек" className="space-y-4"><div className="skeleton h-12" /><div className="skeleton h-28" /><div className="skeleton h-40" /></div>;
}
