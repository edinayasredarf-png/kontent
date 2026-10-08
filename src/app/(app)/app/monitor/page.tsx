import Link from "next/link";
import { Bookmark, EyeOff, ExternalLink, RefreshCw, Settings2, Sparkles, PenLine, AlertTriangle, Radar } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PRICES, rub } from "@/lib/wallet";
import { itemToPlanAction, refreshAllAction, setItemStatusAction } from "@/lib/monitor/actions";
import { KIND_LABEL, type Kind } from "@/lib/monitor/fetchers";
import { Digest } from "@/components/Digest";
import { Empty, PageHead } from "@/components/ui";

export const maxDuration = 60;
const PAGE = 30;

interface Row { id: string; title: string; body: string; url: string; published_at: string; matched: string[]; score: number; status: string; source: string; kind: Kind }

export default async function Monitor({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const c = await requireCtx();
  const show = ["new", "saved", "used", "all"].includes(sp.show ?? "") ? sp.show! : "new";
  const days = [1, 3, 7, 30].includes(Number(sp.d)) ? Number(sp.d) : 7;
  const page = Math.max(1, Number(sp.p) || 1);
  const only = sp.m === "1";

  const where: string[] = ["i.org_id=$1", "not i.excluded", `i.published_at > now() - ($2||' days')::interval`];
  const args: unknown[] = [c.org.id, String(days)];
  const add = (cond: string, v: unknown) => { args.push(v); where.push(cond.replace("?", `$${args.length}`)); };
  if (show === "new") where.push("i.status='new'"); else if (show !== "all") add("i.status=?", show); else where.push("i.status<>'dismissed'");
  if (sp.src) add("i.source_id=?", sp.src);
  if (sp.kw) add("? = any(i.matched)", sp.kw);
  if (only) where.push("i.score>0");
  if (sp.q) {
    args.push(`%${sp.q.slice(0, 80).replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`(i.title ilike $${args.length} or i.body ilike $${args.length})`);
  }
  const sql = where.join(" and ");

  const [rows, sources, kws, factories, stat] = await Promise.all([
    q<Row>(`select i.id,i.title,i.body,i.url,i.published_at,i.matched,i.score,i.status,s.title source,s.kind
              from kz_feed_items i join kz_sources s on s.id=i.source_id where ${sql}
             order by i.score desc, i.published_at desc limit ${PAGE + 1} offset ${(page - 1) * PAGE}`, args),
    q<{ id: string; title: string; last_error: string | null }>("select id,title,last_error from kz_sources where org_id=$1 order by title", [c.org.id]),
    q<{ word: string }>("select word from kz_keywords where org_id=$1 and kind='include' order by word", [c.org.id]),
    q<{ id: string; name: string; brand: string }>("select f.id,f.name,b.name brand from kz_factories f join kz_brands b on b.id=f.brand_id where f.org_id=$1 and f.status='active' order by f.name", [c.org.id]),
    q<{ n: string; err: string }>("select count(*) n, count(*) filter (where last_error is not null) err from kz_sources where org_id=$1", [c.org.id]),
  ]);
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const href = (o: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...o })) if (v && k !== "err") u.set(k, v);
    return `/app/monitor?${u}`;
  };
  const noSources = Number(stat[0].n) === 0;

  return (
    <>
      <PageHead title="Мониторинг" sub="Посты и новости из ваших источников. Сортировка — по совпадению с ключевыми словами."
        action={<div className="flex gap-2">
          <form action={refreshAllAction}><button className="btn btn-ghost"><RefreshCw size={15} />Обновить</button></form>
          <Link href="/app/monitor/settings" className="btn"><Settings2 size={15} />Источники и слова</Link>
        </div>} />
      {sp.err && <div className="mb-4 flex items-center gap-2 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{sp.err}</div>}
      {Number(stat[0].err) > 0 && <p className="mb-4 text-xs text-warn">Источников с ошибкой: {stat[0].err}. Подробности в «Источники и слова».</p>}

      {noSources ? (
        <Empty icon={<Radar />} title="Источников пока нет" text="Добавьте сайты, Telegram-каналы, сообщества VK или новости по запросу — лента заполнится сама."
          action={<Link href="/app/monitor/settings" className="btn btn-accent">Добавить источники</Link>} />
      ) : (<>
        <Digest price={c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)} />
        <form className="card mb-4 flex flex-wrap items-center gap-2 p-3" action="/app/monitor">
          <input name="q" defaultValue={sp.q} placeholder="Поиск по тексту" className="input !w-48" />
          <select name="src" defaultValue={sp.src ?? ""} className="input !w-auto"><option value="">Все источники</option>{sources.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
          <select name="kw" defaultValue={sp.kw ?? ""} className="input !w-auto"><option value="">Любое слово</option>{kws.map((x) => <option key={x.word} value={x.word}>{x.word}</option>)}</select>
          <select name="d" defaultValue={String(days)} className="input !w-auto"><option value="1">Сутки</option><option value="3">3 дня</option><option value="7">Неделя</option><option value="30">Месяц</option></select>
          <select name="show" defaultValue={show} className="input !w-auto"><option value="new">Новые</option><option value="saved">Сохранённые</option><option value="used">Использованные</option><option value="all">Все</option></select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="m" value="1" defaultChecked={only} />Только с совпадениями</label>
          <button className="btn btn-ghost ml-auto">Применить</button>
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
              {r.body && r.body !== r.title && <p className="mb-2 line-clamp-3 text-sm text-ink2">{r.body}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {r.matched.map((m) => <span key={m} className="chip !bg-warn-soft !text-warn">{m}</span>)}
                {!r.url.startsWith("manual:") && <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-accent-ink">Открыть<ExternalLink size={12} /></a>}
              </div>
              {r.status !== "used" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {factories.length > 0 ? (
                    <form action={itemToPlanAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <select name="factory" className="input !w-auto !py-1.5 text-xs">{factories.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.brand}</option>)}</select>
                      <button name="mode" value="plan" className="btn btn-ghost !py-1.5"><Sparkles size={14} />В контент-план</button>
                      <button name="mode" value="write" className="btn btn-accent !py-1.5"><PenLine size={14} />Сразу написать</button>
                    </form>
                  ) : <span className="text-xs text-ink3">Чтобы создавать материалы, заведите завод.</span>}
                  <div className="ml-auto flex gap-1">
                    <form action={setItemStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === "saved" ? "new" : "saved"} /><button className="btn btn-ghost !px-2.5 !py-1.5" title={r.status === "saved" ? "Убрать из сохранённых" : "Сохранить"}><Bookmark size={14} /></button></form>
                    <form action={setItemStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="dismissed" /><button className="btn btn-ghost !px-2.5 !py-1.5" title="Скрыть"><EyeOff size={14} /></button></form>
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
