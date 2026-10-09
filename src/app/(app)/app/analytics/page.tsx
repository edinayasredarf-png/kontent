import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { analytics, type Period } from "@/lib/engage";
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
  const a = await analytics(c.org.id, days);
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
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Постов", posts.toLocaleString("ru-RU")], ["Просмотров", views.toLocaleString("ru-RU")], ["Реакций", eng.toLocaleString("ru-RU")], ["Вовлечённость", `${er}%`]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-tile p-5"><div className="mb-1 text-sm text-ink2">{l}</div><div className="text-2xl font-semibold">{v}</div></div>
          ))}
        </div>
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
              <span className="text-sm font-medium">{t.views.toLocaleString("ru-RU")} просм.</span><span className="text-xs text-ink2">{t.likes + t.comments + t.reposts} реакций</span>
              {t.url && <a href={t.url} target="_blank" rel="noreferrer noopener" className="text-accent-ink"><ExternalLink size={14} /></a>}
            </div>
          ))}
        </section>
      </>)}
    </>
  );
}
