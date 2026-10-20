"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { maxConnectChatAction, maxLinkStatusAction, maxStartLinkAction } from "@/lib/max-actions";
import type { MaxChatOpt } from "@/lib/max-bot";

/** Подключение канала MAX через общего бота сервиса: ключ → отправка боту → выбор канала. Всё проверяется на сервере. */
export function MaxBotPanel({ botLink, botName, factoryId }: { botLink: string; botName: string; factoryId?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "linked" | "expired" | "done">("idle");
  const [chats, setChats] = useState<MaxChatOpt[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);

  const brandId = () => (root.current?.closest("form")?.querySelector('select[name="brand_id"]') as HTMLSelectElement | null)?.value ?? "";
  const start = async () => {
    setBusy("key"); setMsg(null);
    const r = await maxStartLinkAction(brandId()).catch(() => null);
    setBusy("");
    if (!r?.ok) { setMsg({ ok: false, text: r ? r.error : "Не удалось получить ключ" }); return; }
    setCode(r.code); setState("pending"); setChats([]);
  };
  const poll = useCallback(async () => {
    if (!code) return;
    const r = await maxLinkStatusAction(code).catch(() => null);
    if (!r?.ok) return;
    setState(r.status); if (r.chats) setChats(r.chats);
  }, [code]);
  // пока ждём, раз в 3 секунды спрашиваем сервер, получил ли бот ключ
  useEffect(() => {
    if (state !== "pending") return;
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [state, poll]);

  const connect = async (c: MaxChatOpt) => {
    setBusy(c.id); setMsg(null);
    const r = await maxConnectChatAction(code, c.id, factoryId).catch(() => null);
    setBusy("");
    if (!r?.ok) { setMsg({ ok: false, text: r ? r.error : "Не удалось подключить" }); return; }
    setState("done"); setMsg({ ok: true, text: `Канал «${r.title}» подключён.` });
    setTimeout(() => window.location.reload(), 1200);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* буфер недоступен */ } };

  return (
    <div ref={root} className="space-y-3">
      <ol className="list-decimal space-y-1.5 rounded-xl bg-tile p-3 pl-8 text-xs text-ink2">
        <li>Откройте нашего бота{botLink ? <> <a href={botLink} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-accent-ink underline">{botName ? `@${botName}` : "в MAX"}<ExternalLink size={11} /></a></> : ""} и добавьте его <b>администратором</b> в ваш канал: «Настройки канала» → «Администраторы» → «Добавить». Дайте право «Писать сообщения», иначе бот не сможет публиковать.</li>
        <li>Нажмите «Получить ключ» ниже: ключ одноразовый и действует 30 минут.</li>
        <li>Отправьте этот ключ боту <b>в личные сообщения</b> в MAX. Так сервис узнаёт, что канал подключаете именно вы.</li>
        <li>Вернитесь сюда: появится список ваших каналов, где вы администратор. Выберите нужный и нажмите «Подключить». Токены и свой бот не нужны.</li>
      </ol>
      {state === "idle" || state === "expired" ? (
        <button type="button" onClick={start} disabled={busy === "key"} className="btn btn-accent !py-2">{busy === "key" && <Loader2 size={15} className="animate-spin" />}Получить ключ</button>
      ) : null}
      {state === "expired" && <p className="text-xs text-warn">Ключ истёк или уже использован. Получите новый.</p>}
      {(state === "pending" || state === "linked") && (
        <div className="space-y-2 rounded-xl bg-surface p-3">
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-lg bg-tile px-3 py-1.5 text-lg font-semibold tracking-widest">{code}</code>
            <button type="button" onClick={copy} className="btn btn-ghost !px-2.5 !py-1 text-xs"><Copy size={13} />{copied ? "Скопировано" : "Копировать"}</button>
            <span className="text-xs text-ink3">Действует 30 минут</span>
          </div>
          {state === "pending" && <p className="flex items-center gap-2 text-xs text-ink2"><Loader2 size={13} className="animate-spin" />Ждём, пока бот получит ключ…</p>}
          {state === "linked" && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs text-good"><CheckCircle2 size={14} />Ключ принят. Выберите канал:</p>
              {chats.length === 0 ? (
                <p className="text-xs text-ink2">Каналов, где вы администратор, а бот добавлен, пока нет. Добавьте бота администратором и нажмите «Обновить».</p>
              ) : chats.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-tile px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm"><b>{c.title}</b><span className="block text-xs text-ink3">{c.channel ? "канал" : "чат"} · id {c.id}</span></span>
                  <button type="button" disabled={!!busy} onClick={() => connect(c)} className="btn btn-ghost !py-1 text-xs">{busy === c.id && <Loader2 size={13} className="animate-spin" />}Подключить</button>
                </div>
              ))}
              <button type="button" onClick={poll} className="btn btn-ghost !px-2.5 !py-1 text-xs"><RefreshCw size={13} />Обновить</button>
            </div>
          )}
        </div>
      )}
      {msg && <p className={`rounded-xl px-3 py-2 text-xs ${msg.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
