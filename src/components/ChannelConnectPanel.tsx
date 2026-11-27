"use client";
import { useEffect, useRef, useState } from "react";
import { isSocialProvider, SOCIAL_NAMES } from "@/lib/social-oauth-catalog";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, ExternalLink, CheckCircle2 } from "lucide-react";
import { startChannelConnection, pollChannelConnection, confirmChannelConnection } from "@/lib/channel-connect-actions";
import type { ConnectionOption, ConnectionProvider } from "@/lib/channel-connections";

export function ChannelConnectPanel({ provider, brandId, factoryId, initialId, onDone, configured = true }: { configured?: boolean; provider: ConnectionProvider; brandId?: string; factoryId?: string; initialId?: string; onDone?: (factoryId: string | null) => void }) {
  const label = isSocialProvider(provider) ? SOCIAL_NAMES[provider] : provider === "vk" ? "VK" : "Telegram";
  const router = useRouter(), inFlight = useRef(false);
  const [id, setId] = useState(initialId || ""), [url, setUrl] = useState("");
  const [status, setStatus] = useState(initialId ? "pending" : "idle"), [options, setOptions] = useState<ConnectionOption[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState("");
  useEffect(() => {
    if (!id || status === "used" || status === "expired" || status === "failed") return;
    let stopped = false;
    const check = async () => {
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      try { const r = await pollChannelConnection(id); if (!stopped && r.ok) { setStatus(r.status); setOptions(r.options); if (r.error) setError(r.error); } }
      catch { if (!stopped) setError("Не удалось проверить подключение. Повторите попытку."); }
      finally { inFlight.current = false; }
    };
    void check(); const timer = setInterval(check, 4000);
    return () => { stopped = true; clearInterval(timer); };
  }, [id, status]);
  async function start() {
    if (busy || !brandId) return;
    // Open from the click itself so the browser does not block the Telegram tab.
    const tab = provider === "telegram" ? window.open("about:blank", "_blank") : null;
    if (tab) tab.opener = null;
    setBusy(true); setError("");
    try {
      const r = await startChannelConnection(provider, brandId, factoryId);
      if (!r.ok) { tab?.close(); setError(r.error); return; }
      setId(r.id); setUrl(r.url); setStatus("pending");
      if (provider !== "telegram") window.location.assign(r.url);
      else if (tab) tab.location.href = r.url;
    } catch { tab?.close(); setError("Не удалось начать подключение. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  async function connect(target: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await confirmChannelConnection(id, target);
      if (!r.ok) { setError(r.error); return; }
      setStatus("used"); setDone(`Канал «${r.title}» подключён`); router.refresh(); onDone?.(r.factoryId);
    } catch { setError("Не удалось подключить канал. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3 rounded-2xl bg-tile p-4">
    {status === "idle" || status === "expired" || status === "failed" ? <>
      <p className="text-sm text-ink2">{isSocialProvider(provider) ? `Разрешите JuicerAI доступ к аккаунту в соцсети «${label}», затем выберите ${provider === "pinterest" ? "доску Pinterest" : provider === "ok" ? "группу ОК" : "аккаунт или страницу"}. Ключи и токены вводить не нужно.` : provider === "vk" ? "Разрешите JuicerAI доступ к VK и выберите своё сообщество. Его можно будет использовать для публикации с изображениями и аналитики." : "Откройте бота JuicerAI, нажмите «Начать» и выберите канал. Telegram предложит выдать боту права публикации."}</p>
      {!configured && <p role="status" className="text-sm text-ink2">{isSocialProvider(provider) ? "Приложение JuicerAI для этой площадки пока не настроено. Администратор платформы должен зарегистрировать приложение и внести параметры в «Администрирование → Соцсети». После этого кнопка станет доступна всем пользователям." : `Подключение ${label} ещё не настроено. Попросите администратора платформы настроить ${provider === "vk" ? "приложение VK" : "бота Telegram"}.`}</p>}
      {brandId && <button type="button" onClick={start} disabled={busy || !configured} className="btn btn-accent">{busy && <Loader2 size={16} className="animate-spin" />}Подключить {label}</button>}
      {status === "expired" && <p className="text-sm text-ink2">Ссылка истекла. Начните подключение заново.</p>}
    </> : status === "pending" || status === "exchanging" ? <>
      <p className="flex items-center gap-2 text-sm text-ink2"><Loader2 size={16} className="animate-spin" />{provider === "telegram" ? "Ждём выбора канала в Telegram" : `Ждём разрешения ${label}`}</p>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost"><ExternalLink size={15} />Открыть {label}</a>}
    </> : status === "ready" ? <div className="space-y-2"><p className="text-sm font-medium">Подтвердите подключение канала</p>{options.map(option => <div key={option.id} className="flex items-center gap-3 rounded-xl bg-surface p-3"><span className="flex-1 text-sm">{option.title}</span><button type="button" className="btn btn-accent !py-2" disabled={busy} onClick={() => connect(option.id)}>{busy && <Loader2 size={14} className="animate-spin" />}Подключить</button></div>)}</div> : null}
    {done && <p role="status" className="flex items-center gap-2 text-sm text-good"><CheckCircle2 size={16} />{done}</p>}
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    {status === "pending" && <button type="button" onClick={() => { setId(""); setStatus("idle"); setError(""); }} className="inline-flex items-center gap-1 text-xs text-ink2"><RefreshCw size={13} />Начать заново</button>}
  </div>;
}
