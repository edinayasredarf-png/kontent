import Link from "next/link";
import { Bookmark, EyeOff, ExternalLink, RefreshCw, Settings2, Sparkles, PenLine, AlertTriangle, Radar } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PRICES, rub } from "@/lib/wallet";
import { createFromNewsAction, digestAction, enrichItemAction, refreshAllAction, scoreNewsAction, setItemStatusAction } from "@/lib/monitor/actions";
import { KINDS } from "@/lib/plan";
import { KIND } from "@/components/ui";
import { Form } from "@/components/Form";
import { bestText } from "@/lib/monitor/news";
import { KIND_LABEL, type Kind } from "@/lib/monitor/fetchers";
import { AiPanel } from "@/components/AiPanel";
import { Empty, PageHead } from "@/components/ui";

import { SubmitButton } from "@/components/SubmitButton";
export const maxDuration = 60;
const PAGE = 30;

interface Row { id: string; title: string; body: string; url: string; published_at: string; matched: string[]; score: number; status: string; source: string; kind: Kind; full_text: string | null; full_status: string; fit_score: number | null; fit_reason: string }

const MAKE = KINDS.filter((k) => k !== "reels");

export default async function Monitor({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const c = await requireCtx();
  const show = ["new", "saved", "used", "all"].includes(sp.show ?? "") ? sp.show! : "new";
  const days = [1, 3, 7, 30].includes(Number(sp.d)) ? Number(sp.d) : 7;
  const page = Math.max(1, Number(sp.p) || 1);
  const only = sp.m === "1";
  const fitOnly = sp.fit === "1";

  const where: string[] = ["i.org_id=$1", "not i.excluded", `i.published_at > now() - ($2||' days')::interval`];
  const args: unknown[] = [c.org.id, String(days)];
  const add = (cond: string, v: unknown) => { args.push(v); where.push(cond.replace("?", `$${args.length}`)); };
  if (show === "new") where.push("i.status='new'"); else if (show !== "all") add("i.status=?", show); else where.push("i.status<>'dismissed'");
  if (sp.src) add("i.source_id=?", sp.src);
  if (sp.kw) add("? = any(i.matched)", sp.kw);
  if (only) where.push("i.score>0");
  if (fitOnly) where.push("i.fit_score >= 6");
  if (sp.q) {
    args.push(`%${sp.q.slice(0, 80).replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`(i.title ilike $${args.length} or i.body ilike $${args.length})`);
  }
  const sql = where.join(" and ");

  const [rows, sources, kws, factories, stat, brands] = await Promise.all([
    q<Row>(`select i.id,i.title,i.body,i.url,i.published_at,i.matched,i.score,i.status,s.title source,s.kind,i.full_text,i.full_status,i.fit_score,i.fit_reason
              from kz_feed_items i join kz_sources s on s.id=i.source_id where ${sql}
             order by ${fitOnly ? "i.fit_score desc nulls last," : ""} i.score desc, coalesce(i.fit_score,-1) desc, i.published_at desc limit ${PAGE + 1} offset ${(page - 1) * PAGE}`, args),
    q<{ id: string; title: string; last_error: string | null }>("select id,title,last_error from kz_sources where org_id=$1 order by title", [c.org.id]),
    q<{ word: string }>("select word from kz_keywords where org_id=$1 and kind='include' order by word", [c.org.id]),
    q<{ id: string; name: string; brand: string }>("select f.id,f.name,b.name brand from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 and f.status='active' order by f.name", [c.org.id]),
    q<{ n: string; err: string }>("select count(*) n, count(*) filter (where last_error is not null) err from kz_sources where org_id=$1", [c.org.id]),
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]),
  ]);
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const href = (o: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...o })) if (v && k !== "err") u.set(k, v);
    return `/app/monitor?${u}`;
  };
  const noSources = Number(stat[0].n) === 0;
  const write = c.org.role !== "viewer";

  return (
    <>
      <PageHead title="Мониторинг" sub="Посты и новости из ваших источников. Сортировка — по совпадению с ключевыми словами."
        action={<div className="flex gap-2">
          <form action={refreshAllAction}><SubmitButton className="btn btn-ghost"><RefreshCw size={15} />Обновить</SubmitButton></form>
          <Link href="/app/monitor/settings" className="btn"><Settings2 size={15} />Источники и слова</Link>
        </div>} />
      {sp.note && <div className="mb-4 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">{sp.note}</div>}
      {sp.err && <div className="mb-4 flex items-center gap-2 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{sp.err}</div>}
      {Number(stat[0].err) > 0 && <p className="mb-4 text-xs text-warn">Источников с ошибкой: {stat[0].err}. Подробности в «Источники и слова».</p>}

      {noSources ? (
        <Empty icon={<Radar />} title="Источников пока нет" text="Добавьте сайты, Telegram-каналы, сообщества VK или новости по запросу — лента заполнится сама."
          action={<Link href="/app/monitor/settings" className="btn btn-accent">Добавить источники</Link>} />
      ) : (<>
        <AiPanel title="Анализ ленты" hint={`Главные темы недели и идеи для материалов · ${c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)}`} button="Что в тренде" action={digestAction} />
        {write && brands.length > 0 && (
          <div className="card mb-4 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2"><b className="text-sm">Подборка новостей для вас</b><span className="text-xs text-ink3">нейросеть оценит свежие новости по профилю бренда и подскажет, как их использовать · {c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)}</span></div>
            <Form action={scoreNewsAction} submit="Подобрать" className="flex flex-wrap items-center gap-2">
              <select name="brand" className="input !w-auto">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </Form>
          </div>
        )}
        <form className="card mb-4 flex flex-wrap items-center gap-2 p-3" action="/app/monitor">
          <input name="q" defaultValue={sp.q} placeholder="Поиск по тексту" className="input !w-48" />
          <select name="src" defaultValue={sp.src ?? ""} className="input !w-auto"><option value="">Все источники</option>{sources.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
          <select name="kw" defaultValue={sp.kw ?? ""} className="input !w-auto"><option value="">Любое слово</option>{kws.map((x) => <option key={x.word} value={x.word}>{x.word}</option>)}</select>
          <select name="d" defaultValue={String(days)} className="input !w-auto"><option value="1">Сутки</option><option value="3">3 дня</option><option value="7">Неделя</option><option value="30">Месяц</option></select>
          <select name="show" defaultValue={show} className="input !w-auto"><option value="new">Новые</option><option value="saved">Сохранённые</option><option value="used">Использованные</option><option value="all">Все</option></select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="m" value="1" defaultChecked={only} />Только с совпадениями</label>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="fit" value="1" defaultChecked={fitOnly} />Подходит мне (оценка 6+)</label>
          <SubmitButton className="btn btn-ghost ml-auto">Применить</SubmitButton>
        </form>

        {list.length === 0 && <p className="card px-6 py-12 text-center text-sm text-ink2">Ничего не найдено. Измените фильтры или добавьте ключевые слова.</p>}
        <div className="space-y-3">
          {list.map((r) => (
            <article key={r.id} className="card p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink3">
                <span className="chip">{KIND_LABEL[r.kind]}</span><span>{r.source}</span><span>·</span>
                <span>{new Date(r.published_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                {r.status === "used" && <span className="chip !bg-good-soft !text-good">в плане</span>}
                {r.status === "saved" && <span className="chip !bg-accent-soft !text-accent-ink">сохранено</span>}
              </div>
              <h3 className="mb-1 text-[15px] font-medium leading-snug">{r.title}</h3>
              {r.fit_score != null && <p className="mb-1 text-xs"><span className={`chip ${r.fit_score >= 7 ? "!bg-good-soft !text-good" : r.fit_score >= 4 ? "!bg-warn-soft !text-warn" : ""}`}>Подходит {r.fit_score}/10</span>{r.fit_reason && <span className="ml-2 text-ink2">{r.fit_reason}</span>}</p>}
              {bestText(r) && bestText(r) !== r.title && <p className="mb-2 line-clamp-3 text-sm text-ink2">{bestText(r).slice(0, 600)}</p>}
              {(r.kind === "site" || r.kind === "news") && (
                r.full_text ? (
                  <details className="mb-2 text-xs text-ink2"><summary className="cursor-pointer text-good">Полный текст загружен · {r.full_text.length.toLocaleString("ru-RU")} знаков</summary><p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap">{r.full_text}</p></details>
                ) : (
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink3">
                    <span>{r.full_status === "unsupported" ? "Текст статьи недоступен для этого источника" : r.full_status === "failed" || r.full_status === "short" ? "Не удалось получить полный текст" : "Только заголовок и анонс из ленты"}</span>
                    {write && r.full_status !== "unsupported" && !r.url.startsWith("manual:") && <form action={enrichItemAction}><input type="hidden" name="id" value={r.id} /><SubmitButton className="btn btn-ghost !px-2.5 !py-1 text-xs">Прочитать полностью</SubmitButton></form>}
                  </div>
                )
              )}
              <div className="flex flex-wrap items-center gap-2">
                {r.matched.map((m) => <span key={m} className="chip !bg-warn-soft !text-warn">{m}</span>)}
                {!r.url.startsWith("manual:") && <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-accent-ink">Открыть<ExternalLink size={12} /></a>}
              </div>
              {r.status !== "used" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {factories.length > 0 ? (
                    <details className="w-full sm:w-auto">
                      <summary className="btn btn-accent !py-1.5 cursor-pointer list-none"><PenLine size={14} />Создать материал из новости</summary>
                      <form action={createFromNewsAction} className="mt-3 space-y-3 rounded-xl bg-tile p-3">
                        <input type="hidden" name="id" value={r.id} />
                        <div><label className="label">В какой завод</label><select name="factory" className="input !bg-surface">{factories.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.brand}</option>)}</select></div>
                        <div><span className="label">Какие материалы создать по этой новости</span>
                          <div className="flex flex-wrap gap-2">{MAKE.map((k) => <label key={k} className="chip cursor-pointer !px-3 !py-1.5 chip-toggle"><input type="checkbox" name="kinds" value={k} defaultChecked={k === "post"} className="hidden" />{KIND[k]}</label>)}</div></div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select name="mode" className="input !w-auto !bg-surface"><option value="now">Создать сразу</option><option value="ideas">Только в контент-план (идеи)</option></select>
                          <SubmitButton className="btn !py-1.5">Создать</SubmitButton>
                        </div>
                        <p className="text-xs text-ink3">Тексты пишутся по {r.full_text ? "полному тексту статьи" : "тексту новости из ленты (для сайтов загрузите полный текст кнопкой выше)"}, факты берутся оттуда. Цена за каждый тип как обычно.</p>
                      </form>
                    </details>
                  ) : <span className="text-xs text-ink3">Чтобы создавать материалы, заведите завод.</span>}
                  <div className="ml-auto flex gap-1">
                    <form action={setItemStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === "saved" ? "new" : "saved"} /><SubmitButton className="btn btn-ghost !px-2.5 !py-1.5" title={r.status === "saved" ? "Убрать из сохранённых" : "Сохранить"}><Bookmark size={14} /></SubmitButton></form>
                    <form action={setItemStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="dismissed" /><SubmitButton className="btn btn-ghost !px-2.5 !py-1.5" title="Скрыть"><EyeOff size={14} /></SubmitButton></form>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
        {(page > 1 || hasMore) && (
          <div className="mt-4 flex justify-center gap-2">
            {page > 1 && <Link className="btn btn-ghost" href={href({ p: String(page - 1) })}>← Назад</Link>}
            {hasMore && <Link className="btn btn-ghost" href={href({ p: String(page + 1) })}>Дальше →</Link>}
          </div>
        )}
      </>)}
    </>
  );
}
