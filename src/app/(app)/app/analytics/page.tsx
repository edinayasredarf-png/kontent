import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { analytics, membersReport, type Period } from "@/lib/engage";
import { recommendAction, refreshStatsAction } from "@/lib/engage-actions";
import { PRICES, rub } from "@/lib/wallet";
import { SUPPORTED_CHANNELS } from "@/lib/publishing";
import { AiPanel } from "@/components/AiPanel";
import { Empty, KIND, PageHead } from "@/components/ui";
import { BarChart3 } from "lucide-react";

export default async function Analytics({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const days: Period = d === "7" ? 7 : d === "all" ? 0 : 30;
  const c = await requireCtx();
  const [a, members] = await Promise.all([analytics(c.org.id, days), membersReport(c.org.id)]);
  const posts = Number(a.tot.posts), views = Number(a.tot.views), eng = Number(a.tot.likes) + Number(a.tot.comments) + Number(a.tot.reposts);
  const er = views ? ((eng / views) * 100).toFixed(1) : "0";
  const maxH = Math.max(1, ...a.byHour.map((h) => Number(h.avg)));
  const periods: [string, string][] = [["7", "7 дней"], ["30", "30 дней"], ["all", "Всё время"]];
  const bound = recommendAction.bind(null, days);
  return (
    <>
      <PageHead title="Аналитика" sub="Просмотры и реакции опубликованных постов. Данные обновляются сами." action={
        <form action={refreshStatsAction}><button className="btn btn-ghost"><RefreshCw size={15} />Обновить</button></form>} />
      <div className="mb-4 flex gap-1 text-sm">{periods.map(([v, l]) => <Link key={v} href={`/app/analytics?d=${v}`} className={`rounded-lg px-3 py-1.5 ${(days === 0 ? "all" : String(days)) === v ? "bg-tile font-medium" : "text-ink2 hover:bg-tile/60"}`}>{l}</Link>)}</div>
      {posts === 0 ? (
        <Empty icon={<BarChart3 />} title="Пока нет данных" text="Статистика появится после публикаций: VK отдаёт просмотры и реакции, Telegram — просмотры (до часа после поста)." />
      ) : (<>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[["Постов", posts.toLocaleString("ru-RU")], ["Просмотров", views.toLocaleString("ru-RU")], ["Реакций", eng.toLocaleString("ru-RU")], ["Вовлечённость", `${er}%`], ...(a.clicks > 0 ? [["Переходов на сайт", a.clicks.toLocaleString("ru-RU")]] : [])].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-tile p-5"><div className="mb-1 text-sm text-ink2">{l}</div><div className="text-2xl font-semibold">{v}</div></div>
          ))}
        </div>
        {members.length > 0 && (
          <section className="card mb-6 p-5">
            <b className="mb-3 block text-sm">Подписчики</b>
            <div className="grid gap-3 md:grid-cols-2">
              {members.map((m) => {
                const mx = Math.max(1, ...m.series.map((p) => p.members)), mn = Math.min(...m.series.map((p) => p.members));
                const diff = (b: number | null) => (b != null && m.now != null ? m.now - b : null);
                const fmtD = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v}`);
                return (
                  <div key={m.id} className="rounded-xl bg-tile p-4">
                    <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm">{SUPPORTED_CHANNELS[m.kind] ?? m.kind}: {m.title}</span><span className="text-xl font-semibold">{(m.now ?? 0).toLocaleString("ru-RU")}</span></div>
                    <div className="mt-1 flex gap-4 text-xs text-ink2"><span>за 7 дней: <b className={(diff(m.d7) ?? 0) >= 0 ? "text-good" : "text-bad"}>{fmtD(diff(m.d7))}</b></span><span>за 30 дней: <b className={(diff(m.d30) ?? 0) >= 0 ? "text-good" : "text-bad"}>{fmtD(diff(m.d30))}</b></span></div>
                    {m.series.length > 1 && <div className="mt-3 flex h-12 items-end gap-0.5">{m.series.map((p, i) => <div key={i} title={`${p.day}: ${p.members}`} className="flex-1 rounded-t bg-accent/70" style={{ height: `${10 + ((p.members - mn) / Math.max(1, mx - mn)) * 90}%` }} />)}</div>}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-ink3">Число подписчиков записывается раз в сутки. График появится через пару дней после подключения канала.</p>
          </section>
        )}
        <AiPanel title="Рекомендации ИИ" hint={`Разбор того, что работает, и что делать на следующей неделе · ${c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)}`} button="Получить рекомендации" action={bound} />
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <section className="card p-5">
            <b className="mb-3 block text-sm">По форматам</b>
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-ink3"><th className="pb-2 font-normal">Формат</th><th className="pb-2 text-right font-normal">Постов</th><th className="pb-2 text-right font-normal">В среднем просмотров</th></tr></thead>
              <tbody>{a.byKind.map((k) => <tr key={k.kind} className="border-t border-line"><td className="py-2">{KIND[k.kind] ?? k.kind}</td><td className="py-2 text-right">{k.posts}</td><td className="py-2 text-right font-medium">{Number(k.avg).toLocaleString("ru-RU")}</td></tr>)}</tbody></table>
          </section>
          <section className="card p-5">
            <b className="mb-3 block text-sm">По каналам</b>
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-ink3"><th className="pb-2 font-normal">Канал</th><th className="pb-2 text-right font-normal">Постов</th><th className="pb-2 text-right font-normal">Просмотров</th></tr></thead>
              <tbody>{a.byChannel.map((k) => <tr key={k.title} className="border-t border-line"><td className="py-2">{SUPPORTED_CHANNELS[k.kind] ?? k.kind}: {k.title}</td><td className="py-2 text-right">{k.posts}</td><td className="py-2 text-right font-medium">{Number(k.views).toLocaleString("ru-RU")}</td></tr>)}</tbody></table>
          </section>
        </div>
        <section className="card mb-6 p-5">
          <b className="mb-1 block text-sm">Лучшее время публикации</b><p className="mb-4 text-xs text-ink2">Средние просмотры поста по часу выхода (МСК). Чем больше постов в часе, тем надёжнее вывод.</p>
          <div className="flex h-32 items-end gap-1">{a.byHour.map((h) => (
            <div key={h.hour} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${h.hour}:00 — ${h.avg} просм. (постов: ${h.posts})`}>
              <div className="w-full rounded-t-md bg-accent/80" style={{ height: `${Math.max(4, (Number(h.avg) / maxH) * 100)}%` }} /><span className="text-[10px] text-ink3">{h.hour}</span>
            </div>))}</div>
        </section>
        <section className="card">
          <div className="border-b border-line px-5 py-3 text-sm font-medium">Лучшие посты</div>
          {a.top.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              <span className="chip">{KIND[t.kind]}</span><span className="min-w-0 flex-1 truncate text-sm">{t.topic}</span>
              <span className="text-xs text-ink3">{t.channel}</span>
              <span className="text-sm font-medium">{t.views.toLocaleString("ru-RU")} просм.</span><span className="text-xs text-ink2">{t.likes + t.comments + t.reposts} реакций</span>{Number(t.clicks) > 0 && <span className="text-xs text-good">{t.clicks} переходов</span>}
              {t.url && <a href={t.url} target="_blank" rel="noreferrer noopener" className="text-accent-ink"><ExternalLink size={14} /></a>}
            </div>
          ))}
        </section>
      </>)}
    </>
  );
}
