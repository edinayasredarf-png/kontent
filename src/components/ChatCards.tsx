"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, CalendarPlus, Check, ChevronDown, ExternalLink, Eye, EyeOff, Heart, Loader2, PenLine, RefreshCw, Send, Trash2 } from "lucide-react";
import { SourceIcon } from "@/components/monitor/SourceIcon";
import { PostText } from "@/components/monitor/PostText";
import { PostPreview } from "@/components/PostPreview";
import { AutoTextarea } from "@/components/AutoTextarea";
import { EMOJI, HASHTAGS, LENGTHS } from "@/lib/postsettings";
import type { Card, ItemRow } from "@/lib/agent/cards";
import {
  cardCreateFromNewsAction, cardExtendPlanAction, cardItemChannelsAction, cardItemDiscardAction, cardItemPublishAction, cardItemRegenAction, cardItemSaveAction, cardItemToPlanAction,
  cardLikeNewsAction, cardRefreshAction, cardSaveBrandAction, cardSaveFactoryAction, cardSaveSignatureAction, cardSetSourceAction, type FactoryPatch,
} from "@/lib/agent/card-actions";

type Res = { ok: boolean; error?: string; note?: string; card?: Card | null; ids?: string[] };
const CH_NAME: Record<string, string> = { vk: "VK", telegram: "Telegram", max: "MAX", wordpress: "WordPress", webhook: "Webhook" };
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ru-RU"));
const dt = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const box = "rounded-2xl border border-line bg-surface p-3.5";

/** Запуск серверного действия с индикатором и сообщением внутри карточки. */
function useRun() {
  const [busy, setBusy] = useState(""), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (key: string, fn: () => Promise<Res>, done?: (r: Res) => void) => {
    setBusy(key); setMsg(null);
    try { const r = await fn(); setMsg(r.ok ? { ok: true, text: r.note ?? "Готово" } : { ok: false, text: r.error ?? "Не удалось выполнить" }); if (r.ok || r.card) done?.(r); }
    catch { setMsg({ ok: false, text: "Нет связи с сервером. Попробуйте ещё раз." }); }
    setBusy("");
  };
  return { busy, msg, run, setMsg };
}
const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) => (m ? <p className={`mt-2 flex items-start gap-1.5 text-xs ${m.ok ? "text-good" : "text-bad"}`}>{m.ok && <Check size={13} className="mt-0.5 shrink-0" />}<span>{m.text}</span></p> : null);

function Toggle({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 py-1.5 text-left disabled:opacity-60">
      <span className="min-w-0"><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-ink2">{hint}</span>}</span>
      <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-tile2"}`}><span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} /></span>
    </button>
  );
}
const Sel = ({ value, onChange, opts, label }: { value: string; onChange: (v: string) => void; opts: Record<string, string>; label: string }) => (
  <label className="block text-xs text-ink2">{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="input mt-1 !py-1.5 text-sm">{Object.entries(opts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
);

/* ───────── материал ───────── */
function ItemCard({ it, replace, drop }: { it: ItemRow; replace: (c: Card | null) => void; drop: () => void }) {
  const { busy, msg, run, setMsg } = useRun();
  const [body, setBody] = useState(it.body), [plan, setPlan] = useState(false), [date, setDate] = useState(it.date), [time, setTime] = useState(it.time), [ask, setAsk] = useState(false), [prev, setPrev] = useState(false);
  useEffect(() => { setBody(it.body); }, [it.body]);
  const ready = it.status === "ready", dirty = body !== it.body;
  const done = it.published.length > 0;
  const upd = (r: Res) => { if (r.card && r.card.t === "item") replace(r.card); };
  const on = it.channels.filter((c) => c.on);
  return (
    <div className={box}>
      <div className="mb-2 flex flex-wrap items-center gap-2"><span className="chip">{it.kindLabel}</span><b className="min-w-0 flex-1 text-sm">{it.topic}</b>{it.factoryName && <span className="text-xs text-ink3">{it.factoryName}</span>}</div>
      {!ready && it.status !== "published" && it.status !== "scheduled" && <p className="rounded-xl bg-tile p-3 text-sm text-ink2">{it.status === "failed" ? "Не удалось создать материал." : "Материал создаётся…"} <button type="button" onClick={() => run("r", async () => ({ ok: true, card: (await cardRefreshAction({ t: "item", ids: [it.id] })).card }), upd)} className="ml-1 font-semibold text-accent-ink underline">Обновить</button></p>}
      {(ready || it.status === "published" || it.status === "scheduled") && (
        <>
          {it.imageId && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/assets/${it.imageId}`} alt="" className="mb-2 max-h-56 w-full rounded-xl object-cover" />}
          {it.draft ? <AutoTextarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="input !rounded-2xl !bg-tile text-sm leading-6" aria-label="Текст материала" /> : <PostText title="" text={it.body} />}
          {dirty && <div className="mt-2 flex gap-2"><button type="button" disabled={!!busy} onClick={() => run("s", () => cardItemSaveAction(it.id, body), upd)} className="btn btn-accent !py-1.5 text-xs">{busy === "s" && <Loader2 size={13} className="animate-spin" />}Сохранить текст</button><button type="button" onClick={() => setBody(it.body)} className="btn btn-ghost !py-1.5 text-xs">Отменить</button></div>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink3"><span>Знаков: {body.length}</span>
            <button type="button" onClick={() => setPrev((v) => !v)} className="chip chip-toggle ml-auto cursor-pointer !px-2.5 !py-0.5">{prev ? <EyeOff size={12} className="mr-1" /> : <Eye size={12} className="mr-1" />}Как будет выглядеть</button></div>
          {prev && <div className="mt-2"><PostPreview text={body} images={it.imageId ? [`/api/assets/${it.imageId}`] : []} kinds={on.map((c) => c.kind)} oneMessageTg={false} name={it.factoryName || "Ваш канал"} kind={it.kind} /></div>}
          {it.channels.length > 0 && !done && (
            <div className="mt-3"><span className="mb-1 block text-xs font-semibold text-ink2">Куда публикуем</span>
              <div className="flex flex-wrap gap-1.5">{it.channels.map((c) => (
                <button key={c.id} type="button" aria-pressed={c.on} disabled={!!busy} onClick={() => run("c", () => cardItemChannelsAction(it.id, it.channels.filter((x) => (x.id === c.id ? !x.on : x.on)).map((x) => x.id)), upd)}
                  className={`chip cursor-pointer !px-3 !py-1.5 text-xs ${c.on ? "!bg-accent-soft !text-accent-ink ring-1 ring-accent" : ""}`}>{c.on ? "✓ " : ""}{CH_NAME[c.kind] ?? c.kind}: {c.title}</button>))}</div></div>
          )}
          {done && <ul className="mt-3 space-y-1 text-xs">{it.published.map((p, i) => <li key={i} className={p.ok ? "text-good" : "text-bad"}>{p.ok ? "Опубликовано" : "Ошибка"}: {p.channel}{p.error ? ` — ${p.error}` : ""}{p.url && <a href={p.url} target="_blank" rel="noreferrer noopener" className="ml-1 underline">открыть пост</a>}</li>)}</ul>}
          {!done && ready && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!ask
                ? <button type="button" disabled={!!busy || dirty || !on.length} title={dirty ? "Сначала сохраните текст" : !on.length ? "Выберите канал" : ""} onClick={() => setAsk(true)} className="btn btn-accent !py-1.5 text-sm"><Send size={14} />Опубликовать сейчас</button>
                : <span className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3 py-1.5 text-xs text-warn">Опубликовать в: {on.map((c) => c.title).join(", ")}?
                    <button type="button" disabled={!!busy} onClick={() => { setAsk(false); run("p", () => cardItemPublishAction(it.id), upd); }} className="font-semibold underline">{busy === "p" ? "Публикуем…" : "Да, опубликовать"}</button><button type="button" onClick={() => setAsk(false)} className="underline">Отмена</button></span>}
              <button type="button" disabled={!!busy || dirty} onClick={() => setPlan((v) => !v)} className="btn btn-ghost !py-1.5 text-sm"><CalendarPlus size={14} />В контент-план</button>
              {it.draft && <><button type="button" disabled={!!busy} onClick={() => run("g", () => cardItemRegenAction(it.id), upd)} className="btn btn-ghost !py-1.5 text-sm">{busy === "g" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Создать заново</button>
                <button type="button" disabled={!!busy} onClick={() => run("d", async () => { const r = await cardItemDiscardAction(it.id); return r; }, () => drop())} className="btn btn-ghost !py-1.5 text-sm text-bad"><Trash2 size={14} />Удалить</button></>}
            </div>
          )}
          {plan && !done && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-tile p-2.5 text-sm">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input !w-auto !py-1.5" aria-label="Дата" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input !w-auto !py-1.5" aria-label="Время" />
              <button type="button" disabled={!!busy} onClick={() => run("pl", () => cardItemToPlanAction(it.id, date, time), (r) => { upd(r); setPlan(false); })} className="btn btn-accent !py-1.5 text-sm">{busy === "pl" && <Loader2 size={14} className="animate-spin" />}Поставить</button>
            </div>
          )}
        </>
      )}
      <Msg m={msg} />
      {msg && !msg.ok && <button type="button" onClick={() => setMsg(null)} className="sr-only">Скрыть</button>}
    </div>
  );
}

/* ───────── новость ───────── */
function NewsCards({ card, replace }: { card: Extract<Card, { t: "news" }>; replace: (c: Card) => void }) {
  const [open, setOpen] = useState<string>(""), [made, setMade] = useState<Record<string, ItemRow[]>>({});
  const { busy, msg, run } = useRun();
  const [factory, setFactory] = useState(card.factories[0]?.id ?? ""), [kinds, setKinds] = useState<string[]>(["post"]), [mode, setMode] = useState<"now" | "ideas">("now");
  return (
    <div className="space-y-3">
      {card.items.map((n) => (
        <div key={n.id} className={box}>
          <div className="flex items-center gap-2.5">
            <SourceIcon kind={n.sourceKind as never} size={32} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{n.source}</p><p className="text-xs text-ink3">{dt(n.at)}{n.used ? " · в работе" : ""}{n.fit != null ? ` · подходит ${n.fit}/10` : ""}</p></div>
            <button type="button" aria-pressed={n.liked} title={n.liked ? "Убрать из понравившегося" : "Понравилось"} disabled={n.used || busy === `l${n.id}`}
              onClick={() => run(`l${n.id}`, () => cardLikeNewsAction(n.id, !n.liked), (r) => { const nc = r.card; if (nc && nc.t === "news") replace({ ...card, items: card.items.map((x) => (x.id === n.id ? nc.items[0] ?? x : x)) }); })}
              className={`grid size-8 place-items-center rounded-full bg-tile hover:bg-tile2 ${n.liked ? "text-bad" : "text-ink2"}`}><Heart size={15} fill={n.liked ? "currentColor" : "none"} /></button>
          </div>
          <div className="mt-2.5"><PostText title={n.title} text={n.text} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!n.used && card.factories.length > 0 && <button type="button" onClick={() => setOpen(open === n.id ? "" : n.id)} className="btn btn-accent !py-1.5 text-sm"><PenLine size={14} />Создать материал<ChevronDown size={14} className={open === n.id ? "rotate-180" : ""} /></button>}
            {n.url && <a href={n.url} target="_blank" rel="noreferrer noopener" className="btn btn-ghost !py-1.5 text-sm">Открыть источник<ExternalLink size={13} /></a>}
          </div>
          {open === n.id && (
            <div className="mt-3 space-y-3 rounded-xl bg-tile p-3">
              <label className="block text-xs text-ink2">В какой завод<select value={factory} onChange={(e) => setFactory(e.target.value)} className="input mt-1 !bg-surface !py-1.5 text-sm">{card.factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <div><span className="mb-1 block text-xs text-ink2">Что создать (до двух)</span><div className="flex flex-wrap gap-1.5">{card.kinds.map((k) => { const on = kinds.includes(k.id); return <button key={k.id} type="button" aria-pressed={on} onClick={() => setKinds(on ? kinds.filter((x) => x !== k.id) : [...kinds, k.id].slice(-2))} className={`chip cursor-pointer !px-3 !py-1 text-xs ${on ? "!bg-accent-soft !text-accent-ink ring-1 ring-accent" : ""}`}>{on ? "✓ " : ""}{k.label}</button>; })}</div></div>
              <Sel label="Как" value={mode} onChange={(v) => setMode(v as "now" | "ideas")} opts={{ now: "Написать сразу и показать здесь (платно)", ideas: "Только идея в контент-план" }} />
              <button type="button" disabled={!!busy || !kinds.length} onClick={() => run(`c${n.id}`, () => cardCreateFromNewsAction(n.id, factory, kinds, mode), (r) => { if (r.card?.t === "item") setMade((m) => ({ ...m, [n.id]: (r.card as Extract<Card, { t: "item" }>).items })); setOpen(""); })} className="btn btn-accent !py-1.5 text-sm">{busy === `c${n.id}` && <Loader2 size={14} className="animate-spin" />}{busy === `c${n.id}` ? "Создаю, это занимает до минуты…" : "Создать"}</button>
            </div>
          )}
          {(made[n.id] ?? []).map((it) => <div key={it.id} className="mt-3"><ItemCard it={it} replace={(c) => c && c.t === "item" && setMade((m) => ({ ...m, [n.id]: m[n.id].map((x) => (x.id === it.id ? c.items[0] : x)) }))} drop={() => setMade((m) => ({ ...m, [n.id]: m[n.id].filter((x) => x.id !== it.id) }))} /></div>)}
        </div>
      ))}
      <Msg m={msg} />
    </div>
  );
}

/* ───────── завод ───────── */
function FactoryCard({ c, replace }: { c: Extract<Card, { t: "factory" }>; replace: (c: Card) => void }) {
  const { busy, msg, run } = useRun();
  const [cta, setCta] = useState(c.st.cta), [link, setLink] = useState(c.st.link);
  useEffect(() => { setCta(c.st.cta); setLink(c.st.link); }, [c.st.cta, c.st.link]);
  const save = (p: FactoryPatch, key = "s") => run(key, () => cardSaveFactoryAction(c.id, p), (r) => { if (r.card?.t === "factory") replace(r.card); });
  const dirty = cta !== c.st.cta || link !== c.st.link;
  return (
    <div className={box}>
      <div className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-sm">{c.name}</b><span className="text-xs text-ink3">{c.brand}</span><Link href={`/app/factories/${c.id}`} className="text-xs text-accent-ink underline">Открыть</Link></div>
      <p className="mt-1 text-xs text-ink2">В плане запас до {c.planUntil ? new Date(c.planUntil).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "— (план пуст)"} · идей: {c.ideas} · готово: {c.ready}</p>
      <div className="mt-2 divide-y divide-line">
        <Toggle on={c.status === "active"} disabled={!!busy} onChange={(v) => save({ status: v ? "active" : "paused" })} label="Завод работает" hint={c.status === "active" ? "Идеи и материалы создаются по расписанию" : "Поставлен на паузу"} />
        <Toggle on={c.autopublish} disabled={!!busy} onChange={(v) => save({ autopublish: v })} label="Автопубликация" hint="Готовые материалы выходят в каналы по расписанию сами" />
        <Toggle on={c.approval === "auto"} disabled={!!busy} onChange={(v) => save({ approval: v ? "auto" : "manual" })} label="Идеи одобряются сами" hint="Выключено: каждую идею вы одобряете вручную" />
        <Toggle on={c.images} disabled={!!busy} onChange={(v) => save({ images: v })} label="Картинки к материалам" hint="Нейросеть рисует картинку к каждому посту (платно)" />
      </div>
      {c.channels.length > 0 && <div className="mt-2"><span className="mb-1 block text-xs font-semibold text-ink2">Куда публикует завод</span><div className="flex flex-wrap gap-1.5">{c.channels.map((ch) => (
        <button key={ch.id} type="button" aria-pressed={ch.on} disabled={!!busy} onClick={() => save({ channelIds: c.channels.filter((x) => (x.id === ch.id ? !x.on : x.on)).map((x) => x.id) }, "c")} className={`chip cursor-pointer !px-3 !py-1.5 text-xs ${ch.on ? "!bg-accent-soft !text-accent-ink ring-1 ring-accent" : ""}`}>{ch.on ? "✓ " : ""}{CH_NAME[ch.kind] ?? ch.kind}: {ch.title}</button>))}</div></div>}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Sel label="Длина поста" value={c.st.length} onChange={(v) => save({ length: v })} opts={LENGTHS} />
        <Sel label="Эмодзи" value={c.st.emoji} onChange={(v) => save({ emoji: v })} opts={EMOJI} />
        <Sel label="Хештеги" value={c.st.hashtags} onChange={(v) => save({ hashtags: v })} opts={HASHTAGS} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-ink2">Призыв к действию<input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={200} placeholder="Запишитесь на консультацию" className="input mt-1 !py-1.5 text-sm" /></label>
        <label className="block text-xs text-ink2">Ссылка на сайт<input value={link} onChange={(e) => setLink(e.target.value)} maxLength={300} placeholder="https://" className="input mt-1 !py-1.5 text-sm" /></label>
      </div>
      {dirty && <button type="button" disabled={!!busy} onClick={() => save({ cta, link })} className="btn btn-accent mt-2 !py-1.5 text-sm">{busy === "s" && <Loader2 size={14} className="animate-spin" />}Сохранить</button>}
      <Msg m={msg} />
    </div>
  );
}

/* ───────── остальные ───────── */
function SourcesCard({ c, replace }: { c: Extract<Card, { t: "sources" }>; replace: (c: Card) => void }) {
  const { busy, msg, run } = useRun();
  return (
    <div className={box}><b className="mb-1 block text-sm">Источники новостей</b>
      <div className="divide-y divide-line">{c.sources.map((s) => (
        <div key={s.id}><Toggle on={s.status === "active"} disabled={!!busy} onChange={(v) => run(s.id, () => cardSetSourceAction(s.id, v ? "active" : "paused"), (r) => { if (r.card?.t === "sources") replace(r.card); })} label={s.title} hint={`${s.status === "active" ? `новостей за сутки: ${s.news24}` : "на паузе"}${s.error ? ` · ошибка: ${s.error.slice(0, 80)}` : ""}`} /></div>))}</div>
      <Msg m={msg} /><Link href="/app/monitor/settings" className="mt-2 inline-block text-xs text-accent-ink underline">Все источники и ключевые слова</Link></div>
  );
}

function AnalyticsCard({ c, replace }: { c: Extract<Card, { t: "analytics" }>; replace: (c: Card) => void }) {
  const { busy, msg, run } = useRun();
  const mx = Math.max(1, ...c.channels.map((x) => x.views));
  return (
    <div className={box}>
      <div className="mb-2 flex flex-wrap items-center gap-2"><b className="flex items-center gap-1.5 text-sm"><BarChart3 size={15} />Аналитика</b>
        <div className="ml-auto flex gap-1">{[1, 7, 30, 90].map((d) => <button key={d} type="button" aria-pressed={c.days === d} disabled={!!busy} onClick={() => run("p", async () => ({ ok: true, card: (await cardRefreshAction({ t: "analytics", days: d })).card }), (r) => { if (r.card) replace(r.card); })} className={`chip cursor-pointer !px-2.5 !py-0.5 text-xs ${c.days === d ? "!bg-accent-soft !text-accent-ink ring-1 ring-accent" : ""}`}>{d === 1 ? "Сутки" : `${d} дн.`}</button>)}</div></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Постов", fmt(c.posts)], ["Просмотров", fmt(c.views)], ["Реакций", fmt(c.reactions)], ["Вовлечённость", `${c.er}%`]].map(([l, v]) => <div key={l} className="rounded-xl bg-tile px-3 py-2"><div className="text-base font-semibold">{v}</div><div className="text-[11px] text-ink2">{l}</div></div>)}</div>
      {c.channels.length > 0 && <div className="mt-3 space-y-1.5">{c.channels.map((x) => <div key={x.title} className="text-xs"><div className="flex justify-between"><span>{CH_NAME[x.kind] ?? x.kind}: {x.title}</span><span className="text-ink2">{fmt(x.views)} просм. · {x.posts} п.</span></div><div className="mt-0.5 h-1.5 rounded-full bg-tile"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (x.views / mx) * 100)}%` }} /></div></div>)}</div>}
      {c.top.length > 0 && <div className="mt-3"><span className="mb-1 block text-xs font-semibold text-ink2">Лучшие посты</span><ul className="space-y-1 text-xs">{c.top.map((t, i) => <li key={i} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{t.topic}</span><span className="text-ink2">{fmt(t.views)}</span>{t.url && <a href={t.url} target="_blank" rel="noreferrer noopener" className="text-accent-ink"><ExternalLink size={12} /></a>}</li>)}</ul></div>}
      <Msg m={msg} /><Link href="/app/analytics" className="mt-2 inline-block text-xs text-accent-ink underline">Полная аналитика и материалы по ссылке</Link>
    </div>
  );
}

function CompetitorsCard({ c }: { c: Extract<Card, { t: "competitors" }> }) {
  return (
    <div className={box}><b className="mb-2 block text-sm">Конкуренты</b>
      <div className="space-y-2">{c.groups.map((g) => (
        <Link key={g.id} href={`/app/competitors/${g.id}`} className="block rounded-xl bg-tile p-3 hover:opacity-90">
          <div className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-sm">{g.name}</b><span className="text-xs text-ink3">{g.platforms.map((p) => ({ telegram: "Telegram", vk: "VK", site: "Сайт" } as Record<string, string>)[p] ?? p).join(" · ")}</span></div>
          <p className="mt-1 text-xs text-ink2">Подписчики: {fmt(g.members)} · публикаций в неделю: {g.perWeek}{g.avgViews ? ` · просмотров на пост: ${fmt(g.avgViews)}` : ""}</p>
          {g.best && <p className="mt-1 line-clamp-2 text-xs text-ink2">Лучший пост: {g.best}</p>}
        </Link>))}</div>
    </div>
  );
}

function BrandCard({ c, replace }: { c: Extract<Card, { t: "brand" }>; replace: (c: Card) => void }) {
  const { busy, msg, run } = useRun();
  const [f, setF] = useState({ name: c.name, description: c.description, audience: c.audience, tone: c.tone });
  useEffect(() => { setF({ name: c.name, description: c.description, audience: c.audience, tone: c.tone }); }, [c.name, c.description, c.audience, c.tone]);
  const dirty = f.name !== c.name || f.description !== c.description || f.audience !== c.audience || f.tone !== c.tone;
  const inp = (k: keyof typeof f, label: string, area = false) => (
    <label className="block text-xs text-ink2">{label}{area ? <AutoTextarea value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} rows={2} className="input mt-1 !py-1.5 text-sm" /> : <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="input mt-1 !py-1.5 text-sm" />}</label>
  );
  return (
    <div className={`${box} space-y-2`}>
      <div className="flex items-center gap-2"><b className="min-w-0 flex-1 text-sm">Бренд</b>{c.colors.slice(0, 5).map((x) => <span key={x} className="size-4 rounded-full ring-1 ring-line" style={{ background: x }} />)}<Link href={`/app/brands/${c.id}`} className="text-xs text-accent-ink underline">Брендбук</Link></div>
      {inp("name", "Название")}{inp("description", "Описание", true)}{inp("audience", "Аудитория", true)}{inp("tone", "Тон общения")}
      {dirty && <div className="flex gap-2"><button type="button" disabled={!!busy} onClick={() => run("s", () => cardSaveBrandAction(c.id, f), (r) => { if (r.card?.t === "brand") replace(r.card); })} className="btn btn-accent !py-1.5 text-sm">{busy && <Loader2 size={14} className="animate-spin" />}Сохранить</button><button type="button" onClick={() => setF({ name: c.name, description: c.description, audience: c.audience, tone: c.tone })} className="btn btn-ghost !py-1.5 text-sm">Отменить</button></div>}
      <Msg m={msg} />
    </div>
  );
}

const ST: Record<string, string> = { idea: "идея", approved: "одобрено", generating: "пишется", ready: "готово", scheduled: "в очереди" };
function PlanCard({ c, replace }: { c: Extract<Card, { t: "plan" }>; replace: (c: Card) => void }) {
  const { busy, msg, run } = useRun();
  const [ask, setAsk] = useState(false);
  return (
    <div className={box}>
      <div className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-sm">Контент-план: {c.name}</b><Link href={`/app/factories/${c.id}?tab=plan`} className="text-xs text-accent-ink underline">Открыть план</Link></div>
      <p className="mt-1 text-xs text-ink2">Запас до {c.until ? new Date(c.until).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "— (план пуст)"}</p>
      <ul className="mt-2 space-y-1">{c.items.map((i) => <li key={i.id} className="flex items-center gap-2 text-xs"><span className="w-14 shrink-0 text-ink3">{i.date ? new Date(i.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—"}</span><span className="chip !px-2 !py-0 text-[10px]">{ST[i.status] ?? i.status}</span><span className="min-w-0 flex-1 truncate">{i.topic}</span></li>)}{!c.items.length && <li className="text-xs text-ink2">В плане пока ничего нет.</li>}</ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!ask ? <button type="button" onClick={() => setAsk(true)} className="btn btn-ghost !py-1.5 text-sm"><CalendarPlus size={14} />Продлить план</button>
          : <span className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3 py-1.5 text-xs text-warn">Платно. Продлить на:{[7, 14, 30].map((d) => <button key={d} type="button" disabled={!!busy} onClick={() => { setAsk(false); run("e", () => cardExtendPlanAction(c.id, d), (r) => { if (r.card?.t === "plan") replace(r.card); }); }} className="font-semibold underline">{d} дн.</button>)}<button type="button" onClick={() => setAsk(false)} className="underline">Отмена</button></span>}
        {busy === "e" && <span className="flex items-center gap-1.5 text-xs text-ink2"><Loader2 size={13} className="animate-spin" />Составляю план…</span>}
      </div>
      <Msg m={msg} />
    </div>
  );
}

function ChannelsCard({ c, replace }: { c: Extract<Card, { t: "channels" }>; replace: (c: Card) => void }) {
  const { busy, msg, run } = useRun();
  const [sig, setSig] = useState<Record<string, string>>({});
  return (
    <div className={box}><div className="flex items-center gap-2"><b className="min-w-0 flex-1 text-sm">Каналы публикации</b><Link href="/app/channels" className="text-xs text-accent-ink underline">Подключить ещё</Link></div>
      <div className="mt-2 space-y-2">{c.channels.map((ch) => { const v = sig[ch.id] ?? ch.signature, dirty = v !== ch.signature; return (
        <div key={ch.id} className="rounded-xl bg-tile p-3"><div className="flex items-center gap-2 text-sm"><b className="min-w-0 flex-1 truncate">{ch.title}</b><span className="text-xs text-ink3">{CH_NAME[ch.kind] ?? ch.kind} · {ch.brand}</span></div>
          <label className="mt-1.5 block text-xs text-ink2">Подпись под постами<AutoTextarea value={v} onChange={(e) => setSig({ ...sig, [ch.id]: e.target.value })} rows={1} maxLength={500} placeholder="Например: Подписывайтесь на наш канал" className="input mt-1 !bg-surface !py-1.5 text-sm" /></label>
          {dirty && <button type="button" disabled={!!busy} onClick={() => run(ch.id, () => cardSaveSignatureAction(ch.id, v), (r) => { if (r.card?.t === "channels") { replace(r.card); setSig({}); } })} className="btn btn-accent mt-2 !py-1 text-xs">{busy === ch.id && <Loader2 size={13} className="animate-spin" />}Сохранить подпись</button>}</div>); })}</div>
      <Msg m={msg} /></div>
  );
}

/** Карточки под ответом ассистента: сами посты, материалы, настройки и цифры, с кнопками и переключателями, которые сохраняются сразу. */
export function ChatCards({ cards }: { cards: Card[] }) {
  const [list, setList] = useState<Card[]>(cards);
  useEffect(() => { setList(cards); }, [cards]);
  const swap = (i: number) => (c: Card) => setList((l) => l.map((x, j) => (j === i ? c : x)));
  if (!list.length) return null;
  return (
    <div className="mt-4 space-y-3">
      {list.map((c, i) => {
        const k = `${c.t}:${i}`;
        if (c.t === "news") return <NewsCards key={k} card={c} replace={swap(i)} />;
        if (c.t === "item") return <div key={k} className="space-y-3">{c.items.map((it) => <ItemCard key={it.id} it={it} replace={(n) => n && n.t === "item" && setList((l) => l.map((x, j) => (j === i && x.t === "item" ? { ...x, items: x.items.map((y) => (y.id === it.id ? n.items[0] ?? y : y)) } : x)))} drop={() => setList((l) => l.map((x, j) => (j === i && x.t === "item" ? { ...x, items: x.items.filter((y) => y.id !== it.id) } : x)))} />)}</div>;
        if (c.t === "factory") return <FactoryCard key={k} c={c} replace={swap(i)} />;
        if (c.t === "sources") return <SourcesCard key={k} c={c} replace={swap(i)} />;
        if (c.t === "analytics") return <AnalyticsCard key={k} c={c} replace={swap(i)} />;
        if (c.t === "competitors") return <CompetitorsCard key={k} c={c} />;
        if (c.t === "brand") return <BrandCard key={k} c={c} replace={swap(i)} />;
        if (c.t === "plan") return <PlanCard key={k} c={c} replace={swap(i)} />;
        return <ChannelsCard key={k} c={c} replace={swap(i)} />;
      })}
    </div>
  );
}
