"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, Loader2, RefreshCw, Search, Settings2, SlidersHorizontal, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { countNewAction, refreshFeedAction } from "@/lib/monitor/actions";
import { filterQuery, type FeedFilter } from "@/lib/monitor/feed-query";

const PILL = "inline-flex h-10 items-center gap-2 rounded-full bg-accent-soft px-4 text-sm font-semibold text-ink transition hover:bg-tile2 disabled:opacity-60";

/**
 * Панель над лентой: «Анализ ленты», «Обновить», «Фильтр», «Настройки». «Обновить» опрашивает источники фильтра и,
 * если появились новые посты, показывает строку «Загружено N новых постов»; по нажатию лента перезагружается и плавно прокручивается к самым свежим.
 * Раз в минуту новые посты проверяются и сами (без опроса источников).
 */
export function FeedToolbar({ filter, since, sources, keywords, analysis, settings, children }: { filter: FeedFilter; since: string; sources: { id: string; title: string }[]; keywords: string[]; analysis: React.ReactNode; settings: React.ReactNode; children: React.ReactNode }) {
  const router = useRouter();
  const [modal, setModal] = useState<"filter" | "analysis" | "settings" | null>(null);
  const [busy, setBusy] = useState(false), [fresh, setFresh] = useState(0), [note, setNote] = useState("");
  const [loading, start] = useTransition(), [applying, setApplying] = useState(false);
  const params = { show: filter.show, d: String(filter.days), src: filter.src, kw: filter.kw, q: filter.q, m: filter.only ? "1" : "", fit: filter.fit ? "1" : "", sort: filter.sort };
  const qs = filterQuery(filter);
  const active = (filter.src.length ? 1 : 0) + (filter.kw.length ? 1 : 0) + (filter.q ? 1 : 0) + (filter.only ? 1 : 0) + (filter.fit ? 1 : 0) + (filter.show !== "new" ? 1 : 0) + (filter.days !== 7 ? 1 : 0) + (filter.sort !== "date" ? 1 : 0);

  useEffect(() => { setFresh(0); }, [since]);
  useEffect(() => { if (!loading) setApplying(false); }, [loading]);
  // тихая проверка новых постов раз в минуту, пока вкладка открыта
  useEffect(() => {
    const t = setInterval(async () => { if (document.hidden) return; try { const r = await countNewAction(params, since); setFresh(r.count); } catch { /* сеть */ } }, 60_000);
    return () => clearInterval(t);
  }, [since, qs]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    if (busy) return; setBusy(true); setNote("");
    try {
      const r = await refreshFeedAction(params, since); setFresh(r.count);
      setNote(r.count ? "" : `Источников проверено: ${r.polled}${r.failed ? `, с ошибкой: ${r.failed}` : ""}. Новых постов нет.`);
      if (!r.count) setTimeout(() => setNote(""), 6000);
    } catch { setNote("Не удалось обновить. Попробуйте ещё раз."); } finally { setBusy(false); }
  };
  const show = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    start(() => { router.replace(`/app/monitor${filterQuery(filter, { fresh: since })}`, { scroll: false }); router.refresh(); });
  }, [filter, router, since]);
  const close = useCallback(() => setModal(null), []);
  // фильтр применяется сразу при любом изменении (поиск по тексту — через 0,4 с после последней буквы): окно остаётся открытым, лента за ним обновляется
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submit = (form: HTMLFormElement) => {
    const u = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) if (typeof v === "string" && v !== "") u.append(k, v);
    setApplying(true);
    start(() => router.replace(`/app/monitor${u.size ? `?${u}` : ""}`, { scroll: false }));
  };
  const later = (form: HTMLFormElement, ms: number) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => submit(form), ms); };
  const apply = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); if (timer.current) clearTimeout(timer.current); submit(e.currentTarget); };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className={PILL} onClick={() => setModal("analysis")}><Sparkles size={16} />Анализ ленты</button>
        <button type="button" className={PILL} onClick={refresh} disabled={busy} title="Проверить источники и подгрузить новые посты"><RefreshCw size={16} className={busy ? "animate-spin" : ""} />Обновить</button>
        <button type="button" className={PILL} onClick={() => setModal("filter")}><SlidersHorizontal size={16} />Фильтр{active > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-white">{active}</span>}</button>
        <button type="button" className={PILL} onClick={() => setModal("settings")}><Settings2 size={16} />Настройки</button>
      </div>
      {note && <p className="mb-4 text-center text-xs text-ink2">{note}</p>}
      {fresh > 0 && (
        <div className="sticky top-24 z-30 mb-4 flex justify-center">
          <button type="button" onClick={show} disabled={loading} aria-busy={loading} className="inline-flex h-10 animate-[modal-in_.25s_ease-out] items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-float transition hover:opacity-90 disabled:cursor-wait disabled:opacity-90">{loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}{loading ? "Загружаем новые посты…" : `Загружено ${fresh} ${plural(fresh)} · показать`}</button>
        </div>
      )}
      {applying && loading && (
        <div role="status" className="sticky top-24 z-30 mb-4 flex justify-center"><span className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-5 text-sm font-semibold text-ink shadow-float outline outline-1 -outline-offset-1 outline-accent"><Loader2 size={16} className="animate-spin text-accent" />Применяем фильтр…</span></div>
      )}
      <div key={qs} className={applying && loading ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>{children}</div>

      {modal === "filter" && (
        <Modal title="Фильтр ленты" onClose={close} footer={
          <div className="flex items-center justify-between gap-3">
            <Link href="/app/monitor" onClick={close} className="text-sm font-semibold text-ink2 hover:text-ink">Сбросить всё</Link>
            <button type="button" onClick={close} className="btn !h-11 !px-8">Готово</button>
          </div>}>
          <form id="feed-filter" action="/app/monitor" onSubmit={apply} onChange={(e) => later(e.currentTarget, (e.target as unknown as HTMLInputElement).name === "q" ? 400 : 120)} className="space-y-6">
            <div>
              <p className="label">Поиск по тексту</p>
              <label className="flex h-11 items-center gap-2 rounded-full bg-accent-soft px-4"><Search size={15} className="text-ink2" /><input name="q" defaultValue={filter.q} placeholder="Слово или фраза" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
            </div>
            <div>
              <p className="label">Источники <span className="font-normal text-ink3">— ничего не выбрано: все</span></p>
              <div className="flex flex-wrap gap-2">{sources.length === 0 ? <span className="text-sm text-ink3">Источников пока нет.</span> : sources.map((s) => (
                <label key={s.id} className="chip chip-toggle cursor-pointer !px-3.5 !py-1.5 !text-[13px]"><input type="checkbox" name="src" value={s.id} defaultChecked={filter.src.includes(s.id)} className="hidden" />{s.title}</label>))}</div>
            </div>
            <div>
              <p className="label">Ключевые слова <span className="font-normal text-ink3">— показать посты, где они найдены</span></p>
              <div className="flex flex-wrap gap-2">{keywords.length === 0 ? <span className="text-sm text-ink3">Слов пока нет. Добавьте в «Настройках».</span> : keywords.map((w) => (
                <label key={w} className="chip chip-toggle cursor-pointer !px-3.5 !py-1.5 !text-[13px]"><input type="checkbox" name="kw" value={w} defaultChecked={filter.kw.includes(w)} className="hidden" />{w}</label>))}</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><p className="label">Период</p><select name="d" defaultValue={String(filter.days)} className="input"><option value="1">Сутки</option><option value="3">3 дня</option><option value="7">Неделя</option><option value="30">Месяц</option></select></div>
              <div><p className="label">Показывать</p><select name="show" defaultValue={filter.show} className="input"><option value="new">Новые</option><option value="saved">Понравившиеся</option><option value="used">Использованные</option><option value="all">Все</option></select></div>
              <div><p className="label">Порядок</p><select name="sort" defaultValue={filter.sort} className="input"><option value="date">Сначала свежие</option><option value="match">По совпадению со словами</option></select></div>
            </div>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" name="m" value="1" defaultChecked={filter.only} className="size-4" />Только с совпадениями по ключевым словам</label>
              <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" name="fit" value="1" defaultChecked={filter.fit} className="size-4" />Только подходящие мне (оценка 6 и выше)</label>
            </div>
          </form>
        </Modal>
      )}
      {modal === "settings" && <Modal title="Источники и ключевые слова" onClose={close} wide>{settings}</Modal>}
      {modal === "analysis" && <Modal title="Анализ ленты" onClose={close}>{analysis}</Modal>}
    </>
  );
}

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "новый пост" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "новых поста" : "новых постов");
