"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, FileText, LifeBuoy, Megaphone, MessageSquare, Newspaper, Rocket, Send, Users, Wallet, X } from "lucide-react";
import type { Notification, NotifyKind } from "@/lib/notify";
import { markAllNotificationsAction, markNotificationAction, pollNotificationsAction } from "@/lib/notify-actions";

const ICON: Record<NotifyKind, { i: typeof Bell; c: string }> = {
  published: { i: CheckCircle2, c: "text-good" }, publish_failed: { i: AlertTriangle, c: "text-bad" }, material_ready: { i: FileText, c: "text-accent" }, generation_failed: { i: AlertTriangle, c: "text-bad" },
  ideas_pending: { i: Send, c: "text-warn" }, news_match: { i: Newspaper, c: "text-accent" }, source_error: { i: AlertTriangle, c: "text-warn" }, support: { i: LifeBuoy, c: "text-accent" },
  low_balance: { i: Wallet, c: "text-warn" }, topup: { i: Wallet, c: "text-good" }, plan_low: { i: Send, c: "text-warn" }, comments: { i: MessageSquare, c: "text-accent" },
  team: { i: Users, c: "text-accent" }, announce: { i: Megaphone, c: "text-accent" }, setup: { i: Rocket, c: "text-accent" }, report: { i: FileText, c: "text-accent" },
};

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

/** Колокольчик: непрочитанные уведомления во всплывающем окне, обновляется сам; новое уведомление на секунды показывается плашкой. */
export function NotificationBell({ unread: u0 }: { unread: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null), [alerts, setAlerts] = useState(0), [unread, setUnread] = useState(u0), [open, setOpen] = useState(false), [toast, setToast] = useState<Notification | null>(null);
  const box = useRef<HTMLDivElement>(null), seen = useRef<Set<string> | null>(null), prev = useRef(u0), openRef = useRef(false);
  useEffect(() => { openRef.current = open; }, [open]);
  // список грузится при первом открытии; фоновый опрос раз в минуту спрашивает только число и тянет список, лишь когда появилось новое
  const load = async () => {
    const r = await pollNotificationsAction(true);
    const fresh = seen.current ? r.items.filter((n) => !seen.current!.has(n.id) && !n.read_at) : [];
    seen.current = new Set(r.items.map((n) => n.id));
    setItems(r.items); setUnread(r.unread); setAlerts(r.alerts); prev.current = r.unread;
    return fresh;
  };
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        if (openRef.current) { await load(); return; }
        const r = await pollNotificationsAction(false);
        if (!alive) return;
        if (r.unread > prev.current) {
          const fresh = await load();
          if (alive && fresh.length) { setToast(fresh[0]); setTimeout(() => setToast((t) => (t?.id === fresh[0].id ? null : t)), 6000); }
        } else { setUnread(r.unread); prev.current = r.unread; }
      } catch { /* нет связи: попробуем в следующий раз */ }
    };
    const id = setInterval(() => { if (!document.hidden) void tick(); }, 60_000);
    const vis = () => { if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  const go = async (n: Notification) => {
    setOpen(false); setToast(null);
    if (!n.read_at) { setItems((l) => (l ? l.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) : l)); setUnread((c) => Math.max(0, c - 1)); void markNotificationAction(n.id); }
    if (n.href) { if (/^https?:\/\//.test(n.href)) window.open(n.href, "_blank", "noopener"); else router.push(n.href); }
  };
  const all = async () => { setItems((l) => l?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? l); setUnread(0); await markAllNotificationsAction(); };
  const badge = unread + (unread === 0 ? 0 : 0);
  const row = (n: Notification, compact = false) => {
    const I = ICON[n.kind] ?? { i: Bell, c: "text-accent" }; const Ic = I.i;
    return (
      <button key={n.id} type="button" onClick={() => go(n)} className={`flex w-full items-start gap-3 text-left ${compact ? "" : "px-4 py-3 hover:bg-ink/[.06]/60"} ${!n.read_at && !compact ? "bg-accent-soft/40" : ""}`}>
        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-tile ${I.c}`}><Ic size={16} /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-5">{n.title}</span>{n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-ink2">{n.body}</span>}<span className="mt-0.5 block text-[11px] text-ink3">{ago(n.created_at)}</span></span>
        {!n.read_at && !compact && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
      </button>
    );
  };
  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => { setOpen((v) => !v); if (!open) void load().catch(() => {}); }} aria-label="Уведомления" title="Уведомления" className="relative grid size-10 place-items-center rounded-full text-ink2 hover:bg-ink/[.06]">
        <Bell size={20} />{badge > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-4 text-white">{badge > 9 ? "9+" : badge}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-20 z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-float md:absolute md:inset-x-auto md:right-0 md:top-12 md:w-[380px]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3"><b className="flex-1 text-sm">Уведомления</b>{unread > 0 && <button type="button" onClick={all} className="link-btn">Прочитать все</button>}</div>
          <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {items === null && <p className="px-4 py-8 text-center text-sm text-ink3">Загружаем…</p>}
            {items?.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink3">Пока тихо. Здесь появятся публикации, ошибки, новости по вашим словам и ответы поддержки.</p>}
            {items?.map((n) => row(n))}
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs">
            <Link href="/app/notifications" onClick={() => setOpen(false)} className="link-btn">Все уведомления</Link>
            <Link href="/app/overview" onClick={() => setOpen(false)} className="link-btn link-btn-quiet">Что требует внимания{alerts > 0 ? ` · ${alerts}` : ""}</Link>
          </div>
        </div>
      )}
      {toast && !open && (
        <div className="fixed right-4 top-24 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-3 shadow-float">
          <button type="button" aria-label="Закрыть" onClick={() => setToast(null)} className="absolute right-2 top-2 text-ink3 hover:text-ink"><X size={14} /></button>
          {row(toast, true)}
        </div>
      )}
    </div>
  );
}
