import Link from "next/link";
import { Bookmark, EyeOff, ExternalLink, RefreshCw, Settings2, SlidersHorizontal, PenLine, AlertTriangle, Radar, ArrowUp } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PRICES, rub } from "@/lib/wallet";
import { createFromNewsAction, digestAction, enrichItemAction, refreshAllAction, scoreNewsAction, setItemStatusAction } from "@/lib/monitor/actions";
import { KINDS } from "@/lib/plan";
import { POST_TYPES } from "@/lib/postsettings";
import { ANGLES } from "@/lib/monitor/angles";
import { KIND } from "@/components/ui";
import { Form } from "@/components/Form";
import { bestText } from "@/lib/monitor/news";
import { KIND_LABEL, type Kind } from "@/lib/monitor/fetchers";
import { AiPanel } from "@/components/AiPanel";
import { Empty } from "@/components/ui";
import { SourceIcon } from "@/components/monitor/SourceIcon";
import { FadeList } from "@/components/monitor/FadeList";
import { FeedToolbar } from "@/components/monitor/FeedToolbar";
import { PostText } from "@/components/monitor/PostText";
import { NoResults } from "@/components/monitor/NoResults";
import { SettingsBody } from "@/components/monitor/SettingsBody";
import { feedOrder, feedWhere, filterQuery, parseFilter } from "@/lib/monitor/feed-query";
import { sourceView } from "@/lib/monitor/display";

import { SubmitButton } from "@/components/SubmitButton";
export const maxDuration = 60;
const PAGE = 30;
const ICON = "grid size-8 place-items-center rounded-full bg-accent-soft text-ink transition hover:bg-tile2";

interface Row { id: string; fetched_at: string; title: string; body: string; url: string; published_at: string; matched: string[]; score: number; status: string; source: string; ref: string; config: Record<string, unknown> | null; kind: Kind; full_text: string | null; full_status: string; fit_score: number | null; fit_reason: string }

const MAKE = KINDS.filter((k) => k !== "reels");

export default async function Monitor({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const c = await requireCtx();
  const f = parseFilter(sp);
  const page = Math.max(1, Number(one(sp.p)) || 1);
  const freshSince = Number.isNaN(Date.parse(one(sp.fresh))) ? 0 : Date.parse(one(sp.fresh));
  const { sql, args } = feedWhere(c.org.id, f);

  const [rows, sources, kws, factories, stat, brands] = await Promise.all([
    q<Row>(`select i.id,i.title,i.body,i.url,i.published_at,i.fetched_at,i.matched,i.score,i.status,s.title source,s.ref,s.kind,s.config,i.full_text,i.full_status,i.fit_score,i.fit_reason
              from kz_feed_items i join kz_sources s on s.id=i.source_id where ${sql}
             order by ${feedOrder(f)} limit ${PAGE + 1} offset ${(page - 1) * PAGE}`, args),
    q<{ id: string; title: string; last_error: string | null }>("select id,title,last_error from kz_sources where org_id=$1 order by title", [c.org.id]),
    q<{ word: string }>("select word from kz_keywords where org_id=$1 and kind='include' order by word", [c.org.id]),
    q<{ id: string; name: string; brand: string }>("select f.id,f.name,b.name brand from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 and f.status='active' order by f.name", [c.org.id]),
    q<{ n: string; err: string }>("select count(*) n, count(*) filter (where last_error is not null) err from kz_sources where org_id=$1", [c.org.id]),
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]),
  ]);
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const href = (o: Record<string, string>) => `/app/monitor${filterQuery(f, o)}`;
  const since = list.length ? new Date(Math.max(...list.map((r) => new Date(r.fetched_at).getTime()))).toISOString() : new Date().toISOString();
  const noSources = Number(stat[0].n) === 0;
  const write = c.org.role !== "viewer";

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <h1 className="mb-6 text-center text-3xl font-semibold leading-9 md:text-4xl">Мониторинг новостей</h1>
      {one(sp.note) && <div className="mb-4 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">{one(sp.note)}</div>}
      {one(sp.err) && <div className="mb-4 flex items-center gap-2 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{one(sp.err)}</div>}
      {Number(stat[0].err) > 0 && <p className="mb-4 text-center text-xs text-warn">Источников с ошибкой: {stat[0].err}. Подробности в «Настройках».</p>}

      {noSources ? (
        <Empty icon={<Radar />} title="Источников пока нет" text="Добавьте сайты, Telegram-каналы, сообщества VK или новости по запросу: лента заполнится сама."
          action={<Link href="/app/monitor/settings" className="btn btn-accent">Добавить источники</Link>} />
      ) : (<FeedToolbar filter={f} since={since} sources={sources.map((x) => ({ id: x.id, title: x.title }))} keywords={kws.map((k) => k.word)} settings={<SettingsBody />} analysis={
        <div className="space-y-4">
          <AiPanel title="Что в тренде" hint={`Главные темы недели и идеи для материалов · ${c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)}`} button="Показать" action={digestAction} />
          {write && brands.length > 0 && (
            <div className="card p-4">
              <div className="mb-2"><b className="text-sm">Подборка новостей для вас</b><p className="mt-0.5 text-xs text-ink2">Нейросеть оценит свежие новости по профилю бренда и подскажет, как их использовать · {c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)}</p></div>
              <Form action={scoreNewsAction} submit="Подобрать" className="flex flex-wrap items-center gap-2">
                <select name="brand" className="input !w-auto">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              </Form>
            </div>
          )}
        </div>}>
        {list.length === 0 && <NoResults q={f.q} filtered={f.q !== "" || f.src.length > 0 || f.kw.length > 0 || f.only || f.fit || f.show !== "new" || f.days !== 7} />}
        <FadeList className="space-y-5">
          {list.map((r, idx) => {
            const sv = sourceView(r.kind, r.source, r.ref, r.config ?? {}), text = bestText(r), when = new Date(r.published_at);
            return (
            <article key={r.id} style={{ "--i": idx } as React.CSSProperties} className={`feed-card rounded-3xl bg-tile p-2.5 will-change-transform [transition:opacity_.15s_linear] ${freshSince && new Date(r.fetched_at).getTime() > freshSince ? "feed-fresh" : ""}`}>
              <header className="flex items-center gap-3 rounded-2xl bg-accent-soft px-3 py-2.5">
                <SourceIcon kind={r.kind} avatar={typeof r.config?.avatar === "string" ? r.config.avatar : undefined} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-5">{sv.name}</p>
                  {sv.href ? <a href={sv.href} target="_blank" rel="noreferrer noopener" className="block truncate text-xs leading-4 text-ink2 hover:text-accent-ink">{sv.address}</a> : <p className="truncate text-xs leading-4 text-ink2">{sv.address}</p>}
                </div>
                <time dateTime={when.toISOString()} className="shrink-0 self-start pt-0.5 text-xs text-ink3">{when.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              </header>
              <div className="px-2.5 pb-1 pt-3">
                {(r.status === "used" || r.status === "saved") && <p className="mb-2">{r.status === "used" ? <span className="chip !bg-good-soft !text-good">в плане</span> : <span className="chip !bg-accent-soft !text-accent-ink">сохранено</span>}</p>}
                <PostText title={r.title} text={text} />
                {r.fit_score != null && <p className="mt-2 text-xs"><span className={`chip ${r.fit_score >= 7 ? "!bg-good-soft !text-good" : r.fit_score >= 4 ? "!bg-warn-soft !text-warn" : ""}`}>Подходит {r.fit_score}/10</span>{r.fit_reason && <span className="ml-2 text-ink2">{r.fit_reason}</span>}</p>}
                {(r.kind === "site" || r.kind === "news") && (
                  r.full_text ? (
                    <details className="mt-2 text-xs text-ink2"><summary className="cursor-pointer text-good">Полный текст загружен · {r.full_text.length.toLocaleString("ru-RU")} знаков</summary><p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap">{r.full_text}</p></details>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink3">
                      <span>{r.full_status === "unsupported" ? "Текст статьи недоступен для этого источника" : r.full_status === "failed" || r.full_status === "short" ? "Не удалось получить полный текст" : "Только заголовок и анонс из ленты"}</span>
                      {write && r.full_status !== "unsupported" && !r.url.startsWith("manual:") && <form action={enrichItemAction}><input type="hidden" name="id" value={r.id} /><SubmitButton className="btn btn-ghost !px-2.5 !py-1 text-xs">Прочитать полностью</SubmitButton></form>}
                    </div>
                  )
                )}
                {r.matched.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{r.matched.map((m) => <span key={m} className="chip !bg-warn-soft !text-warn">{m}</span>)}</div>}
              </div>
              {r.status !== "used" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 px-2.5 pb-2 pt-2">
                  {factories.length > 0 ? (
                    <details className="w-full sm:w-auto">
                      <summary className="btn btn-accent !py-1.5 cursor-pointer list-none"><PenLine size={14} />Создать материал из новости</summary>
                      <form action={createFromNewsAction} className="mt-3 space-y-3 rounded-xl bg-tile p-3">
                        <input type="hidden" name="id" value={r.id} />
                        <div><label className="label">В какой завод</label><select name="factory" className="input !bg-surface">{factories.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.brand}</option>)}</select></div>
                        <div><span className="label">Какие материалы создать по этой новости</span>
                          <div className="flex flex-wrap gap-2">{MAKE.map((k) => <label key={k} className="chip cursor-pointer !px-3 !py-1.5 chip-toggle"><input type="checkbox" name="kinds" value={k} defaultChecked={k === "post"} className="hidden" />{KIND[k]}</label>)}</div></div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div><label className="label">Как подать новость</label><select name="angle" defaultValue="retell" className="input !bg-surface">{Object.entries(ANGLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                          <div><label className="label">Стиль написания</label><select name="postType" defaultValue="" className="input !bg-surface"><option value="">По настройкам завода</option>{Object.entries(POST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select name="mode" className="input !w-auto !bg-surface"><option value="now">Создать сразу</option><option value="ideas">Только в контент-план (идеи)</option></select>
                          <SubmitButton className="btn !py-1.5">Создать</SubmitButton>
                        </div>
                        <p className="text-xs text-ink3">Тексты пишутся по {r.full_text ? "полному тексту статьи" : "тексту новости из ленты (для сайтов загрузите полный текст кнопкой выше)"}, факты берутся оттуда, манера письма и факты о компании берутся из базы знаний бренда. Цена за каждый тип как обычно.</p>
                      </form>
                    </details>
                  ) : <span className="text-xs text-ink3">Чтобы создавать материалы, заведите завод.</span>}
                  <div className="ml-auto flex items-center gap-1">
                    {!r.url.startsWith("manual:") && <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-xs font-medium hover:bg-tile2">Открыть<ExternalLink size={12} /></a>}
                    <form action={setItemStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === "saved" ? "new" : "saved"} /><SubmitButton className="grid size-8 place-items-center rounded-full bg-surface hover:bg-tile2" title={r.status === "saved" ? "Убрать из сохранённых" : "Сохранить"}><Bookmark size={14} /></SubmitButton></form>
                    <form action={setItemStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="dismissed" /><SubmitButton className="grid size-8 place-items-center rounded-full bg-surface hover:bg-tile2" title="Скрыть"><EyeOff size={14} /></SubmitButton></form>
                  </div>
                </div>
              )}
              {r.status === "used" && !r.url.startsWith("manual:") && <div className="px-2.5 pb-2 pt-1"><a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-xs font-medium hover:bg-tile2">Открыть источник<ExternalLink size={12} /></a></div>}
            </article>
            );
          })}
        </FadeList>
        {(page > 1 || hasMore) && (
          <div className="mt-4 flex justify-center gap-2">
            {page > 1 && <Link className="btn btn-ghost" href={href({ p: String(page - 1) })}>← Назад</Link>}
            {hasMore && <Link className="btn btn-ghost" href={href({ p: String(page + 1) })}>Дальше →</Link>}
          </div>
        )}
        {/* строка вопроса выровнена по ширине карточек и всегда у нижнего края окна */}
        <form action="/app" className="sticky bottom-4 z-30 mt-6">
          <div className="-mx-2 flex items-center gap-2 rounded-full bg-surface py-2 pl-5 pr-2 shadow-float outline outline-1 -outline-offset-1 outline-accent">
            <input name="q" required maxLength={1500} placeholder="Спросите по новостному фонду или попросите создать материал" aria-label="Вопрос ассистенту" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink3" />
            <SubmitButton className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white" aria-label="Отправить в чат"><ArrowUp size={18} /></SubmitButton>
          </div>
        </form>
      </FeedToolbar>)}
    </div>
  );
}
