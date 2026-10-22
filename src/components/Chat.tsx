"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStored } from "@/lib/draft-store";
import { ArrowRight, ArrowUp, Check, Globe, Loader2, Mic, Pencil, Plus, RotateCcw, Square } from "lucide-react";
import { chatActionRun, clearChatAction, sendChatAction } from "@/lib/agent/actions";
import { pendingStore } from "@/lib/pending-store";
import type { ChatMsg } from "@/lib/agent/agent";
import { ChatCards } from "@/components/ChatCards";

const SUGGEST: { text: string; icon: typeof Pencil }[] = [
  { text: "Что сейчас происходит в моём контент-заводе?", icon: Globe },
  { text: "Создай пост из новостей за вчера, связанных с нашим брендом", icon: Pencil },
  { text: "Проанализируй посты за неделю", icon: Pencil },
  { text: "Покажи последние новости из моих источников за вчера", icon: Globe },
];
const TEMPLATES = ["Обнови новости и покажи главное", "Какие идеи ждут моего одобрения?", "Включи автопубликацию в заводе", "Продли контент-план на 7 дней", "Почему не публикуются посты?"];

const greet = (name: string) => {
  const h = new Date().getHours();
  const w = h < 5 ? "доброй ночи" : h < 12 ? "доброе утро" : h < 18 ? "добрый день" : "добрый вечер";
  return name ? `${name}, ${w}!` : `${w[0].toUpperCase()}${w.slice(1)}!`;
};

function Text({ t }: { t: string }) {
  return (
    <div className="space-y-3">
      {t.split(/\n{2,}/).map((para, i) => {
        const lines = para.split("\n");
        if (lines.every((l) => /^\s*[•\-*]\s+/.test(l))) return <ul key={i} className="space-y-1.5">{lines.map((l, j) => <li key={j} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" /><span>{l.replace(/^\s*[•\-*]\s+/, "")}</span></li>)}</ul>;
        return <p key={i} className="whitespace-pre-wrap">{para}</p>;
      })}
    </div>
  );
}

function Actions({ m }: { m: ChatMsg }) {
  const router = useRouter();
  const [state, setState] = useState<Record<number, { busy?: boolean; ok?: boolean; text?: string; href?: string }>>({});
  const run = async (i: number) => {
    setState((s) => ({ ...s, [i]: { busy: true } })); pendingStore.inc();
    try { const r = await chatActionRun(m.id, i); setState((s) => ({ ...s, [i]: { ok: r.ok, text: r.text, href: r.href } })); if (r.ok) router.refresh(); }
    catch { setState((s) => ({ ...s, [i]: { ok: false, text: "Не удалось выполнить" } })); } finally { pendingStore.dec(); }
  };
  const acts = m.blocks.actions ?? [];
  if (!acts.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {acts.map((a, i) => {
        const st = state[i], done = a.done && a.done !== "выполняется" ? a.done : st?.ok ? st.text : "";
        return (
          <div key={i} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <div className="min-w-0 flex-1"><b className="block text-sm font-semibold">{a.label}</b>{a.hint && <span className="block truncate text-xs text-ink2">{a.hint}</span>}</div>
            {done ? <span className="flex items-center gap-1.5 text-sm text-good"><Check size={16} />{done}{st?.href && <Link href={st.href} className="ml-1 underline">Открыть</Link>}</span>
              : <button type="button" disabled={st?.busy} onClick={() => run(i)} className="btn btn-accent !rounded-full">{st?.busy && <Loader2 size={14} className="animate-spin" />}Выполнить</button>}
            {st?.ok === false && <span className="w-full text-xs text-bad">{st.text}</span>}
          </div>
        );
      })}
    </div>
  );
}

type SR = { start(): void; stop(): void; lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function Chat({ initial, name, free, autoAsk }: { initial: ChatMsg[]; name: string; free: boolean; autoAsk?: string }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<ChatMsg[]>(initial);
  const [text, setText] = useStored<string>("chat-input", ""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [menu, setMenu] = useState(false), [rec, setRec] = useState(false);
  const [hello, setHello] = useState("Здравствуйте!");
  const end = useRef<HTMLDivElement>(null), area = useRef<HTMLTextAreaElement>(null), sr = useRef<SR | null>(null);
  useEffect(() => setHello(greet(name)), [name]);
  useEffect(() => setMsgs(initial), [initial]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs.length, busy]);
  useEffect(() => { const a = area.current; if (a) { a.style.height = "auto"; a.style.height = Math.min(a.scrollHeight, 160) + "px"; } }, [text]);

  async function send(v: string) {
    const m = v.trim(); if (!m || busy) return;
    setErr(""); setText(""); setBusy(true); pendingStore.inc();
    setMsgs((x) => [...x, { id: "tmp-" + Date.now(), role: "user", content: m, blocks: {}, created_at: new Date().toISOString() }]);
    try { const r = await sendChatAction(m); if (r.error) setErr(r.error); router.refresh(); }
    catch { setErr("Нет связи с сервером. Попробуйте ещё раз."); } finally { setBusy(false); pendingStore.dec(); }
  }
  function mic() {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) { setErr("Голосовой ввод не поддерживается этим браузером"); return; }
    if (rec) { sr.current?.stop(); return; }
    const r = new C(); r.lang = "ru-RU"; r.interimResults = true; sr.current = r;
    r.onresult = (e) => setText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setRec(false); r.onerror = () => { setRec(false); setErr("Не удалось распознать речь. Проверьте доступ к микрофону."); };
    setRec(true); setErr(""); r.start();
  }
  // вопрос, пришедший из другого раздела (например, «Мониторинг»): отправляем один раз и очищаем адрес
  const asked = useRef(false);
  useEffect(() => { if (autoAsk && !asked.current) { asked.current = true; router.replace("/app"); send(autoAsk); } }, [autoAsk]); // eslint-disable-line react-hooks/exhaustive-deps
  const empty = msgs.length === 0;

  const composer = (
    <div className="relative">
      <div className="rounded-3xl bg-surface shadow-soft outline outline-1 -outline-offset-1 outline-accent focus-within:outline-2">
        <div className="flex items-end gap-1 p-2">
          <div className="relative">
            <button type="button" onClick={() => setMenu((x) => !x)} aria-label="Быстрые запросы" className="grid size-9 place-items-center rounded-full text-accent hover:bg-accent-soft"><Plus size={20} /></button>
            {menu && (
              <div className="absolute bottom-11 left-0 z-20 w-72 rounded-2xl border border-line bg-surface p-1 shadow-float">
                <p className="px-3 py-1.5 text-xs text-ink2">Быстрые запросы</p>
                {TEMPLATES.map((t) => <button key={t} type="button" onClick={() => { setMenu(false); send(t); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-accent-soft">{t}</button>)}
              </div>
            )}
          </div>
          <textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={1500} disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
            placeholder="Напишите, что вы хотите получить или создать" className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-[7px] text-base outline-none placeholder:text-ink3" />
          <button type="button" onClick={mic} aria-label={rec ? "Остановить запись" : "Голосовой ввод"} className={`grid size-9 place-items-center rounded-full ${rec ? "bg-bad-soft text-bad" : "text-accent hover:bg-accent-soft"}`}>{rec ? <Square size={16} /> : <Mic size={19} />}</button>
          <button type="button" onClick={() => send(text)} disabled={busy || !text.trim()} aria-label="Отправить" className="grid size-9 place-items-center rounded-full bg-accent text-white disabled:opacity-40">{busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={19} />}</button>
        </div>
      </div>
      {err && <p className="mt-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}
      <p className="mt-2 text-center text-xs text-ink3">{free ? "Ответы бесплатны для админа." : "Ответ ассистента стоит 3 ₽, обновление новостей бесплатно."} Платные действия выполняются только после вашего нажатия.</p>
    </div>
  );

  if (empty) {
    return (
      <div className="relative flex min-h-[calc(100vh-230px)] flex-col items-center justify-center pb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark-watermark.svg" alt="" aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[588px] -translate-x-1/2 select-none opacity-90" />
        <div className="relative w-full max-w-[808px] px-2">
          <h2 className="text-center text-2xl font-bold">{hello}</h2>
          <p className="mb-8 mt-2 text-center text-base text-ink2">Сегодня отличный день, чтобы создать отличный контент</p>
          {composer}
          <div className="mt-6">
            {SUGGEST.map((s) => (
              <button key={s.text} type="button" onClick={() => send(s.text)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-base leading-snug hover:bg-accent-soft/70"><s.icon size={18} className="shrink-0 text-ink2" />{s.text}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto flex min-h-[calc(100vh-190px)] w-full max-w-[808px] flex-col">
      <div className="mb-2 flex justify-end"><button type="button" onClick={async () => { await clearChatAction(); setMsgs([]); router.refresh(); }} className="flex items-center gap-1.5 text-xs text-ink2 hover:text-ink"><RotateCcw size={13} />Новый чат</button></div>
      <div className="flex-1 space-y-6 pb-6">
        {msgs.map((m) => m.role === "user" ? (
          <div key={m.id} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-accent-soft px-5 py-3 text-base">{m.content}</div></div>
        ) : (
          <div key={m.id} className="text-base leading-7">
            <Text t={m.content} />
            {!!m.blocks.links?.length && <div className="mt-4 flex flex-wrap gap-2">{m.blocks.links.map((l) => <Link key={l.href + l.label} href={l.href} className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-ink hover:border-accent">{l.label}<ArrowRight size={15} /></Link>)}</div>}
            {!!m.cards?.length && <ChatCards cards={m.cards} />}
            <Actions m={m} />
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-ink2"><Loader2 size={16} className="animate-spin text-accent" />Смотрю данные вашего контент-завода…</div>}
        <div ref={end} />
      </div>
      <div className="sticky bottom-4 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent pt-4">{composer}</div>
    </div>
  );
}
