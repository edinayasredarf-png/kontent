import Link from "next/link";
import { Heart, EyeOff, ExternalLink, RefreshCw, Settings2, SlidersHorizontal, PenLine, AlertTriangle, Info } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PRICES, rub } from "@/lib/wallet";
import { createFromLikedAction, digestAction, refreshAllAction, scoreNewsAction, setItemStatusAction } from "@/lib/monitor/actions";
import { KINDS } from "@/lib/plan";
import { POST_TYPES } from "@/lib/postsettings";
import { ANGLES } from "@/lib/monitor/angles";
import { KIND } from "@/components/ui";
import { Form } from "@/components/Form";
import { ARTICLE_STATUS, articleNeedsLoading } from "@/lib/monitor/article-state";
import { AutoArticles } from "@/components/monitor/AutoArticles";
import { RssArticle } from "@/components/monitor/RssArticle";
import { bestText } from "@/lib/monitor/news";
import { KIND_LABEL, type Kind } from "@/lib/monitor/fetchers";
import { AiPanel } from "@/components/AiPanel";
import { Empty } from "@/components/ui";
import { SourceIcon } from "@/components/monitor/SourceIcon";
import { FadeList } from "@/components/monitor/FadeList";
import { ModalButton } from "@/components/ui/ModalButton";
import { AskBox } from "@/components/monitor/AskBox";
import { FeedToolbar } from "@/components/monitor/FeedToolbar";
import { PostText } from "@/components/monitor/PostText";
import { NewsCreate } from "@/components/monitor/NewsCreate";
import { DraftHost } from "@/components/DraftHost";
import { NoResults } from "@/components/monitor/NoResults";
import { LazySettings } from "@/components/monitor/LazySettings";
import { NewsMedia } from "@/components/monitor/NewsMedia";
import type { Media } from "@/lib/monitor/parse";
import { feedOrder, feedWhere, filterQuery, parseFilter } from "@/lib/monitor/feed-query";
import { sourceView } from "@/lib/monitor/display";

import { SubmitButton } from "@/components/SubmitButton";
export const maxDuration = 60;
const PAGE = 30;
const ICON = "grid size-8 place-items-center rounded-full bg-accent-soft text-ink transition hover:bg-tile2";

interface Row { id: string; fetched_at: string; title: string; body: string; url: string; published_at: string; matched: string[]; score: number; status: string; source: string; ref: string; config: Record<string, unknown> | null; kind: Kind; media: Media[]; full_text: string | null; full_status: string; fit_score: number | null; fit_reason: string }

const MAKE = KINDS.filter((k) => k !== "reels");
const MATERIAL_KINDS = MAKE.map((value) => ({ value, label: KIND[value] }));

export default async function Monitor({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const draftIds = one(sp.draft).split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const c = await requireCtx();
  const f = parseFilter(sp);
  const page = Math.max(1, Number(one(sp.p)) || 1);
  const freshSince = Number.isNaN(Date.parse(one(sp.fresh))) ? 0 : Date.parse(one(sp.fresh));
  const { sql, args } = feedWhere(c.org.id, f);

  const [rows, sources, kws, factories, brands, likedN] = await Promise.all([
    q<Row>(`select i.id,i.title,i.body,i.url,i.published_at,i.fetched_at,i.matched,i.score,i.status,s.title source,s.ref,s.kind,s.config,i.media,i.full_text,i.full_status,i.fit_score,i.fit_reason
              from kz_feed_items i join kz_sources s on s.id=i.source_id where ${sql}
             order by ${feedOrder(f)} limit ${PAGE + 1} offset ${(page - 1) * PAGE}`, args),
    q<{ id: string; title: string; last_error: string | null }>("select id,title,last_error from kz_sources where org_id=$1 order by title", [c.org.id]),
    q<{ word: string }>("select word from kz_keywords where org_id=$1 and kind='include' order by word", [c.org.id]),
    q<{ id: string; name: string; brand: string }>("select f.id,f.name,b.name brand from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 and f.status='active' order by f.name", [c.org.id]),
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]),
    q<{ n: string }>("select count(*) n from kz_feed_items where org_id=$1 and not excluded and status='saved'", [c.org.id]),
  ]);
  const liked = Number(likedN[0]?.n ?? 0), inLiked = f.show === "saved";
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const href = (o: Record<string, string>) => `/app/monitor${filterQuery(f, o)}`;
  const here = href(page > 1 ? { p: String(page) } : {});
  const since = list.length ? new Date(Math.max(...list.map((r) => new Date(r.fetched_at).getTime()))).toISOString() : new Date().toISOString();
  const noSources = sources.length === 0;
  const sourceErrors = sources.filter((s) => s.last_error).length;
  const write = c.org.role !== "viewer";
  const TAB = "relative flex h-12 items-center whitespace-nowrap px-2.5 text-base font-medium transition-colors";
  const tabs = (
    <>
      <Link href={href({ show: "new", p: "" })} className={`${TAB} ${!inLiked ? "text-ink" : "text-ink/70 hover:text-ink"}`}>Лента{!inLiked && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}</Link>
      <Link href={href({ show: "saved", p: "" })} className={`${TAB} ${inLiked ? "text-ink" : "text-ink/70 hover:text-ink"}`}>Понравившееся{liked ? <span className="ml-1.5 text-xs font-normal text-ink3">{liked}</span> : null}{inLiked && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}</Link>
    </>
  );

  return (
    <div className="w-full">
      <h1 className="sr-only">Мониторинг новостей</h1>
      <div className="w-full">
      {draftIds.length > 0 && <DraftHost orgId={c.org.id} ids={draftIds} returnTo={here} err={one(sp.err) || undefined} note={one(sp.note) || undefined} free={c.org.unlimited} />}
      {one(sp.note) && !draftIds.length && <div className="mb-4 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">{one(sp.note)}</div>}
      {one(sp.err) && !draftIds.length && <div className="mb-4 flex items-center gap-2 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{one(sp.err)}</div>}
      {sourceErrors > 0 && <p className="mb-4 text-center text-xs text-warn">Источников с ошибкой: {sourceErrors}. Подробности в «Настройках».</p>}

      {f.id && <div className="mb-4 flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm"><span>Показан один пост из сводки трендов</span><Link href="/app/monitor" className="link-btn">Показать всю ленту</Link></div>}

      {noSources ? (<>
        <div className="mb-8 flex min-h-12 items-center justify-between gap-3 border-b border-ink/10"><nav className="flex">{tabs}</nav>{write && <ModalButton label="Добавить источник" title="Источники и ключевые слова" className="btn-rect mb-1" icon={null}><LazySettings stamp={Date.now()} /></ModalButton>}</div>
        <div className="w-full max-w-[956px] rounded-xl bg-tile px-6 py-5">
          <p className="flex items-center gap-3 text-xl font-semibold"><Info size={22} className="shrink-0 text-ink2" />Источников пока нет</p>
          <p className="mt-2 pl-[34px] text-base text-ink2">Добавьте сайты, Telegram-каналы, сообщества VK или новости по запросу: лента заполнится сама.</p>
        </div>
      </>) : (<FeedToolbar tabs={tabs} write={write} filter={f} since={since} sources={sources.map((x) => ({ id: x.id, title: x.title }))} keywords={kws.map((k) => k.word)} settings={<LazySettings stamp={Date.now()} />} analysis={
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
        {inLiked && list.length === 0 && f.q === "" && f.src.length === 0 && f.kw.length === 0 && !f.only && !f.fit && <Empty icon={<Heart />} title="Пока ничего не понравилось" text="Нажмите сердечко на новости в ленте: она окажется здесь, и из неё можно будет сделать материалы." />}
        {inLiked && list.length > 0 && write && (
          factories.length > 0 ? (
            <form id="liked-bulk" action={createFromLikedAction} className="mb-5 space-y-3 rounded-3xl bg-tile p-4">
              <div><b className="text-sm">Создать материалы из понравившегося</b><p className="mt-0.5 text-xs text-ink2">Отметьте новости галочками на карточках (до 10 за раз). По каждой в контент-план добавятся идеи выбранных типов, тексты вы создадите оттуда как обычно.</p></div>
              <div><label className="label">В какой завод</label><select name="factory" className="input !bg-surface">{factories.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.brand}</option>)}</select></div>
              <div><span className="label">Какие материалы</span><div className="flex flex-wrap gap-2">{MAKE.map((k) => <label key={k} className="chip cursor-pointer !px-3 !py-1.5 chip-toggle"><input type="checkbox" name="kinds" value={k} defaultChecked={k === "post"} className="hidden" />{KIND[k]}</label>)}</div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label">Как подать новость</label><select name="angle" defaultValue="retell" className="input !bg-surface">{Object.entries(ANGLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="label">Стиль написания</label><select name="postType" defaultValue="" className="input !bg-surface"><option value="">По настройкам завода</option>{Object.entries(POST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <SubmitButton className="btn btn-accent !py-2"><PenLine size={15} />Добавить идеи в контент-план</SubmitButton>
            </form>
          ) : <p className="mb-5 text-center text-xs text-ink3">Чтобы создавать материалы, заведите завод.</p>
        )}
        {list.length === 0 && !inLiked && <NoResults q={f.q} filtered={f.q !== "" || f.src.length > 0 || f.kw.length > 0 || f.only || f.fit || f.show !== "new" || f.days !== 7} />}
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)]">
        <div className="min-w-0">
        <AutoArticles key={list.map((r) => `${r.id}:${r.full_status}`).join(",")} ids={list.filter((r) => articleNeedsLoading(r.kind, r.full_status, r.full_text)).map((r) => r.id)}>
        <FadeList className="space-y-8" topEdge={170}>
          {list.map((r, idx) => {
            const sv = sourceView(r.kind, r.source, r.ref, r.config ?? {}), text = bestText(r), when = new Date(r.published_at);
            return (
            <article key={r.id} style={{ "--i": idx } as React.CSSProperties} className={`feed-card rounded-xl bg-tile p-2.5 will-change-transform [transition:opacity_.15s_linear] ${freshSince && new Date(r.fetched_at).getTime() > freshSince ? "feed-fresh" : ""}`}>
              <header className="flex items-center gap-3 rounded-[10px] bg-surface px-3 py-2.5">
                <SourceIcon kind={r.kind} avatar={r.kind !== "telegram" && typeof r.config?.avatar === "string" ? r.config.avatar : undefined} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-5">{sv.name}</p>
                  {sv.href ? <a href={sv.href} target="_blank" rel="noreferrer noopener" className="block truncate text-xs leading-4 text-ink2 hover:text-accent-ink">{sv.address}</a> : <p className="truncate text-xs leading-4 text-ink2">{sv.address}</p>}
                </div>
                <time dateTime={when.toISOString()} className="shrink-0 self-start pt-0.5 text-xs font-medium text-ink">{when.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              </header>
              <div className="px-2.5 pb-1 pt-3">
                {(r.status === "used" || r.status === "saved") && <p className="mb-2">{r.status === "used" ? <span className="chip !bg-good-soft !text-good">в плане</span> : <span className="chip !bg-bad-soft !text-bad">понравилось</span>}</p>}
                {r.kind === "telegram" ? <>
                  <NewsMedia media={r.media ?? []} title={r.title} itemId={r.id} />
                  <PostText title={r.title} text={text} full />
                </> : (r.kind === "site" || r.kind === "news") ? <RssArticle item={{ id: r.id, title: r.title, body: r.body, full_text: r.full_text, full_status: r.full_status, media: r.media }} kind={r.kind} write={write} /> : <><NewsMedia media={r.media ?? []} title={r.title} /><PostText title={r.title} text={text} /></>}
                {r.fit_score != null && <p className="mt-2 text-xs"><span className={`chip ${r.fit_score >= 7 ? "!bg-good-soft !text-good" : r.fit_score >= 4 ? "!bg-warn-soft !text-warn" : ""}`}>Подходит {r.fit_score}/10</span>{r.fit_reason && <span className="ml-2 text-ink2">{r.fit_reason}</span>}</p>}
                {r.matched.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{r.matched.map((m) => <span key={m} className="chip !bg-warn-soft !text-warn">{m}</span>)}</div>}
              </div>
              {r.status !== "used" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 px-2.5 pb-2 pt-2">
                  {factories.length > 0 ? (
                    <NewsCreate id={r.id} here={here} factories={factories} kinds={MATERIAL_KINDS} fullText={r.full_status === ARTICLE_STATUS && !!r.full_text} />
                  ) : <span className="text-xs text-ink3">Чтобы создавать материалы, заведите завод.</span>}
                  {inLiked && write && factories.length > 0 && <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink2"><input type="checkbox" name="ids" value={r.id} form="liked-bulk" />Выбрать</label>}
                  <div className="ml-auto flex items-center gap-1">
                    {!r.url.startsWith("manual:") && <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface px-3 text-xs font-medium hover:bg-tile2">Открыть<ExternalLink size={12} /></a>}
                    <form action={setItemStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === "saved" ? "new" : "saved"} /><SubmitButton className={`grid size-8 place-items-center rounded-lg bg-surface hover:bg-tile2 ${r.status === "saved" ? "text-bad" : "text-ink2"}`} title={r.status === "saved" ? "Убрать из понравившегося" : "Понравилось: сохранить в «Понравившееся»"} aria-label={r.status === "saved" ? "Убрать из понравившегося" : "Понравилось"} aria-pressed={r.status === "saved"}><Heart size={15} fill={r.status === "saved" ? "currentColor" : "none"} /></SubmitButton></form>
                    <form action={setItemStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="dismissed" /><SubmitButton className="grid size-8 place-items-center rounded-lg bg-surface hover:bg-tile2" title="Скрыть"><EyeOff size={14} /></SubmitButton></form>
                  </div>
                </div>
              )}
              {r.status === "used" && !r.url.startsWith("manual:") && <div className="px-2.5 pb-2 pt-1"><a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface px-3 text-xs font-medium hover:bg-tile2">Открыть источник<ExternalLink size={12} /></a></div>}
            </article>
            );
          })}
        </FadeList>
        </AutoArticles>
        {(page > 1 || hasMore) && (
          <div className="mt-4 flex justify-center gap-2">
            {page > 1 && <Link className="btn btn-ghost" href={href({ p: String(page - 1) })}>← Назад</Link>}
            {hasMore && <Link className="btn btn-ghost" href={href({ p: String(page + 1) })}>Дальше →</Link>}
          </div>
        )}
        </div>
        <AskBox />
        </div>
      </FeedToolbar>)}
      </div>
    </div>
  );
}
