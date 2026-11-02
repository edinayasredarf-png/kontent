"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { telegramPostPath, telegramWidgetHeight } from "@/lib/monitor/telegram-widget";

/** Telegram's own post frame preserves its typography, entities, albums and captions. Only nearby posts load. */
export function TelegramPost({ url, children }: { url: string; children: ReactNode }) {
  const path = telegramPostPath(url);
  const box = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [near, setNear] = useState(false), [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [dark, setDark] = useState(false), [height, setHeight] = useState(320);

  useEffect(() => { setFailed(false); setReady(false); }, [path]);

  useEffect(() => {
    const el = box.current;
    if (!el || !path) return;
    if (!("IntersectionObserver" in window)) { setNear(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); observer.disconnect(); }
    }, { rootMargin: "400px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [path]);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const theme = document.documentElement.dataset.theme;
      setDark(theme === "dark" || (theme !== "light" && media.matches));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    media.addEventListener("change", update);
    return () => { observer.disconnect(); media.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    if (!near || !path || failed) return;
    setReady(false);
    const timer = setTimeout(() => setFailed(true), 15_000);
    const send = (event: string, data: Record<string, unknown> = {}) => frame.current?.contentWindow?.postMessage(JSON.stringify({ ...data, event }), "https://t.me");
    const message = (event: MessageEvent) => {
      if (event.origin !== "https://t.me" || event.source !== frame.current?.contentWindow) return;
      const h = telegramWidgetHeight(event.data);
      if (h !== null) { setHeight(h); setReady(true); clearTimeout(timer); }
      let data;
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (data?.event === "ready") { send("visible"); send("focus", { has_focus: document.hasFocus() }); }
      if (data?.event === "get_coords" && box.current) {
        const r = box.current.getBoundingClientRect();
        send("callback", { _cb: data._cb, value: { frameX: r.left, frameY: r.top, frameWidth: r.width, frameHeight: r.height, scrollX: window.scrollX, scrollY: window.scrollY, windowWidth: window.innerWidth, windowHeight: window.innerHeight } });
      }
    };
    window.addEventListener("message", message);
    return () => { clearTimeout(timer); window.removeEventListener("message", message); };
  }, [near, path, dark, failed]);

  if (!path) return <>{children}</>;
  return (
    <div ref={box} className="relative min-w-0" aria-label="Пост Telegram">
      {(!ready || failed) && <div>{children}</div>}
      {near && !failed && <iframe ref={frame} key={`${path}:${dark}`} src={`https://t.me/${path}?embed=1&mode=tme${dark ? "&dark=1" : ""}`} title={`Пост Telegram ${path}`} width="100%" height={height} scrolling="no" frameBorder="0" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}
        className={ready ? "block w-full border-0" : "absolute inset-x-0 top-0 w-full border-0 opacity-0 pointer-events-none"} />}
      {failed && <p className="mt-2 px-3 text-xs text-ink3">Оригинал Telegram недоступен. Показана сохранённая копия. <a className="text-accent-ink underline" href={`https://t.me/${path}`} target="_blank" rel="noreferrer noopener">Открыть в Telegram</a></p>}
    </div>
  );
}
