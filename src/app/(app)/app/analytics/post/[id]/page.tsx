import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { one } from "@/lib/db";
import { externalHistory, XKIND_NAME, type XKind } from "@/lib/external-posts";
import { deleteExternalAction, refreshExternalAction } from "@/lib/external-actions";
import { PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PostText } from "@/components/monitor/PostText";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ru-RU"));
const EXTRA: Record<string, string> = { reach_total: "Охват, всего", reach_subscribers: "Охват среди подписчиков", links: "Переходы по ссылкам", to_group: "Переходы в сообщество", join_group: "Вступили в сообщество", report: "Пожаловались", hide: "Скрыли запись", unsubscribe: "Отписались" };
const when = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export default async function ExternalPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await requireCtx();
  const p = await one<{ id: string; kind: XKind; url: string; author: string; body: string; posted_at: string | null; created_at: string; last_error: string | null; last_fetched_at: string | null; brand: string | null }>(
    "select p.id,p.kind,p.url,p.author,p.body,p.posted_at,p.created_at,p.last_error,p.last_fetched_at,b.name brand from kz_external_posts p left join kz_brands b on b.id=p.brand_id where p.id=$1 and p.org_id=$2", [id, c.org.id]);
  if (!p) notFound();
  const hist = await externalHistory(c.org.id, id);
  const last = hist[hist.length - 1], first = hist[0];
  const extra = (await one<{ extra: Record<string, number> }>("select extra from kz_external_stats where post_id=$1 order by fetched_at desc limit 1", [id]))?.extra ?? {};
  const write = canWrite(c.org.role);
  const views = last?.views ?? 0, likes = last?.likes ?? 0, comments = last?.comments ?? 0, reposts = last?.reposts ?? 0;
  const er = views ? ((likes + comments + reposts) / views) * 100 : null;
  const posted = p.posted_at ? new Date(p.posted_at) : null;
  const hours = posted ? Math.max(1, (Date.now() - posted.getTime()) / 3_600_000) : null;
  const series = hist.slice(-40);
  const maxV = Math.max(1, ...series.map((h) => h.views));
  const vk = p.kind === "vk";
  const cards: [string, string][] = [["Просмотры", fmt(views)], ["Лайки и реакции", p.kind === "max" ? "—" : fmt(likes)], ...(vk ? [["Комментарии", fmt(comments)], ["Репосты", fmt(reposts)]] as [string, string][] : []), ["Вовлечённость", er == null ? "—" : `${er.toFixed(1)}%`], ["Просмотров в час (в среднем)", hours && views ? fmt(Math.round((views / hours) * 10) / 10) : "—"]];
  return (
    <>
      <Link href="/app/analytics" className="mb-1 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Аналитика</Link>
      <PageHead title={`Пост ${XKIND_NAME[p.kind]}`} sub={`${p.author ? `${p.author} · ` : ""}${posted ? `опубликован ${posted.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })}` : "дата публикации неизвестна"}${p.brand ? ` · ${p.brand}` : ""}`} />
      <div className="mx-auto -mt-3 mb-6 flex flex-wrap items-center justify-center gap-2">
        <a href={p.url} target="_blank" rel="noreferrer noopener" className="pill"><ExternalLink size={15} />Открыть пост</a>
        {write && <>
          <form action={refreshExternalAction}><input type="hidden" name="id" value={id} /><SubmitButton className="pill"><RefreshCw size={15} />Обновить сейчас</SubmitButton></form>
          <form action={deleteExternalAction}><input type="hidden" name="id" value={id} /><SubmitButton data-confirm="Убрать пост из аналитики вместе с накопленной статистикой?" className="grid size-10 place-items-center rounded-full bg-bad-soft text-bad transition hover:opacity-80" title="Убрать" aria-label="Убрать"><Trash2 size={15} /></SubmitButton></form>
        </>}
      </div>
      <div className="mx-auto w-full max-w-[680px] space-y-5">
        {p.last_error && <p className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">Последнее обновление не удалось: {p.last_error}. Показаны прежние данные.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{cards.map(([l, v]) => <div key={l} className="rounded-2xl bg-tile p-4"><div className="mb-1 text-xs text-ink2">{l}</div><div className="text-2xl font-semibold">{v}</div></div>)}</div>
        {Object.keys(extra).length > 0 && (
          <section className="card p-5"><b className="mb-3 block text-sm">Охват и действия читателей</b>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(extra).map(([k, v]) => <div key={k} className="rounded-xl bg-tile px-3 py-2"><div className="text-base font-semibold">{fmt(v)}</div><div className="text-[11px] leading-tight text-ink2">{EXTRA[k] ?? k}</div></div>)}</div></section>
        )}
        <section className="card p-5">
          <b className="mb-1 block text-sm">Рост просмотров</b>
          <p className="mb-3 text-xs text-ink2">{series.length > 1 ? `С ${when(first.at)}: +${fmt(views - first.views)} просмотров. Снимки показателей делаются автоматически.` : "Пока один снимок: график появится после следующего обновления (в первые 3 дня — раз в час)."}</p>
          {series.length > 1 && <div className="flex h-32 items-end gap-0.5">{series.map((h) => <div key={h.at} title={`${when(h.at)} — ${fmt(h.views)} просм.`} className="flex-1 rounded-t bg-accent/75" style={{ height: `${Math.max(4, (h.views / maxV) * 100)}%` }} />)}</div>}
          {hist.length > 0 && (
            <details className="mt-3 text-xs"><summary className="cursor-pointer text-ink2">Таблица снимков ({hist.length})</summary>
              <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-ink3"><th className="pb-1 font-normal">Время (МСК)</th><th className="pb-1 text-right font-normal">Просм.</th><th className="pb-1 text-right font-normal">Лайки</th>{vk && <><th className="pb-1 text-right font-normal">Комм.</th><th className="pb-1 text-right font-normal">Репосты</th></>}</tr></thead>
                <tbody>{[...hist].reverse().slice(0, 60).map((h) => <tr key={h.at} className="border-t border-line"><td className="py-1">{when(h.at)}</td><td className="py-1 text-right">{fmt(h.views)}</td><td className="py-1 text-right">{fmt(h.likes)}</td>{vk && <><td className="py-1 text-right">{fmt(h.comments)}</td><td className="py-1 text-right">{fmt(h.reposts)}</td></>}</tr>)}</tbody></table></details>
          )}
        </section>
        {p.kind === "telegram" && <p className="text-xs text-ink3">Telegram публично отдаёт только просмотры (и реакции, если они видны на странице поста). Охват, пересылки и комментарии доступны лишь владельцу канала в самом Telegram.</p>}
        {p.kind === "max" && <p className="text-xs text-ink3">MAX отдаёт ботам просмотры. Другие показатели доступны в самом приложении.</p>}
        <section className="card p-5"><b className="mb-2 block text-sm">Текст поста</b>{p.body ? <PostText title="" text={p.body} /> : <p className="text-sm text-ink2">Без текста (картинка, видео или документ).</p>}</section>
      </div>
    </>
  );
}
