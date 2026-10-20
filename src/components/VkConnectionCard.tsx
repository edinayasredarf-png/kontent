"use client";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LogOut, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { vkAddChannelAction, vkCheckConnectionAction, vkDisconnectAction, vkGroupsAction } from "@/lib/vk-actions";
import type { VkGroup } from "@/lib/vk-connect";

export interface VkConn { id: string; name: string; status: "active" | "reauth" | "error" | "disconnected"; lastError: string | null; scope: string }

const FLASH: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "ВКонтакте подключён." },
  denied: { ok: false, text: "Вы отказались от доступа на стороне ВКонтакте." },
  state: { ok: false, text: "Запрос подключения не прошёл проверку безопасности. Начните подключение заново." },
  failed: { ok: false, text: "Не удалось завершить подключение. ВКонтакте мог не выдать права: для публикации личным ключом приложению нужны права «стена», «фото» и «видео» (их выдаёт поддержка VK, см. документацию)." },
  forbidden: { ok: false, text: "Подключать аккаунты могут только участники с правом редактирования." },
  not_configured: { ok: false, text: "Приложение VK ID не настроено на сервере (VK_CLIENT_ID)." },
};

const STATE: Record<VkConn["status"], { label: string; cls: string }> = {
  active: { label: "Подключён", cls: "bg-good-soft text-good" },
  reauth: { label: "Требуется повторная авторизация", cls: "bg-warn-soft text-warn" },
  error: { label: "Ошибка подключения", cls: "bg-bad-soft text-bad" },
  disconnected: { label: "Отключён", cls: "bg-tile text-ink2" },
};

/** Личное подключение ВКонтакте: статус, проверка, список сообществ с выбором, отключение. Всё идёт через серверные действия; токены сюда не попадают. */
export function VkConnectionCard({ conns, brands, configured, flash }: { conns: VkConn[]; brands: { id: string; name: string }[]; configured: boolean; flash?: string }) {
  const f = flash ? FLASH[flash] : undefined;
  const [going, setGoing] = useState(false);
  return (
    <section className="card mb-5 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">ВКонтакте: личное подключение</h2>
          <p className="text-xs text-ink3">Вход через VK ID. Нужен, чтобы публиковать в сообщества с картинками от вашего имени: ключ сообщества картинки на стену не принимает.</p>
        </div>
        {configured ? (
          <a href="/api/vk/connect/start" onClick={() => setGoing(true)} className="btn btn-accent !py-2" aria-busy={going}>
            {going ? <Loader2 size={15} className="animate-spin" /> : null}{conns.length ? "Подключить ещё аккаунт" : "Подключить ВКонтакте"}
          </a>
        ) : <span className="chip">Не настроено на сервере</span>}
      </div>
      {f && <p className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${f.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{f.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}{f.text}</p>}
      {!conns.length && <p className="text-sm text-ink2">Не подключён. После подключения вы выберете сообщества, где вы администратор или редактор.</p>}
      {conns.map((c) => <Conn key={c.id} c={c} brands={brands} />)}
    </section>
  );
}

function Conn({ c, brands }: { c: VkConn; brands: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null);
  const [groups, setGroups] = useState<VkGroup[] | null>(null);
  const [brand, setBrand] = useState(brands[0]?.id ?? "");
  const [busyId, setBusyId] = useState("");
  const st = STATE[c.status];
  const run = (fn: () => Promise<void>) => start(async () => { try { await fn(); } catch { setInfo({ ok: false, text: "Не удалось выполнить действие" }); } });
  const usable = c.status === "active";
  return (
    <div className="space-y-3 rounded-2xl bg-tile p-4">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm">{c.name}</b>
        <span className={`chip ${st.cls}`}>{st.label}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {usable && <button type="button" disabled={pending} className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={() => run(async () => { const r = await vkCheckConnectionAction(c.id); setInfo({ ok: r.ok, text: r.ok ? `Работает: ${r.name}` : r.error }); })}><ShieldCheck size={13} />Проверить</button>}
          {usable && <button type="button" disabled={pending} className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={() => run(async () => { const r = await vkGroupsAction(c.id); if (r.ok) { setGroups(r.groups); setInfo(r.groups.length ? null : { ok: false, text: "Нет сообществ, где вы администратор или редактор." }); } else setInfo({ ok: false, text: r.error }); })}><Users size={13} />Сообщества</button>}
          {!usable && <a href="/api/vk/connect/start" className="btn btn-ghost !px-2.5 !py-1 text-xs"><RefreshCw size={13} />Авторизоваться заново</a>}
          {c.status !== "disconnected" && <button type="button" disabled={pending} className="btn btn-ghost !px-2.5 !py-1 text-xs text-bad" onClick={() => { if (!confirm("Отключить ВКонтакте? Токены будут удалены, публикация в связанные каналы остановится.")) return; run(async () => { const r = await vkDisconnectAction(c.id); setInfo({ ok: r.ok, text: r.ok ? "Отключено. Токены удалены." : r.error }); if (r.ok) location.reload(); }); }}><LogOut size={13} />Отключить</button>}
        </span>
      </div>
      {c.status !== "active" && c.lastError && <p className="text-xs text-ink3">{c.lastError}</p>}
      {pending && <p className="flex items-center gap-1.5 text-xs text-ink2"><Loader2 size={13} className="animate-spin" />Работаем…</p>}
      {info && <p className={`rounded-xl px-3 py-2 text-xs ${info.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{info.text}</p>}
      {groups && groups.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink2">Бренд для канала:
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="input !w-auto !py-1 text-xs">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
          {groups.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {g.photo ? <img src={g.photo} alt="" className="size-9 rounded-full" referrerPolicy="no-referrer" /> : <span className="size-9 rounded-full bg-tile" />}
              <span className="min-w-0 flex-1 text-sm"><b>{g.name}</b><span className="block text-xs text-ink3">id {g.id} · {g.type === "page" ? "публичная страница" : g.type === "event" ? "мероприятие" : "группа"} · {g.canPost ? "публикация доступна" : "публикация недоступна: нужны права редактора"}</span></span>
              <button type="button" disabled={!g.canPost || !brand || busyId === g.id} className="btn btn-ghost !py-1 text-xs" onClick={() => { setBusyId(g.id); run(async () => { const r = await vkAddChannelAction(c.id, g.id, brand); setBusyId(""); setInfo({ ok: r.ok, text: r.ok ? `Канал «${r.title}» подключён` : r.error }); if (r.ok) location.reload(); }); }}>Подключить как канал</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
