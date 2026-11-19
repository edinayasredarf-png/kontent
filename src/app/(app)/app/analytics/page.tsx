import { requirePageFeature } from "@/lib/plan-catalog";
import { ExternalLink, RefreshCw } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { analytics, membersReport } from "@/lib/engage";
import { q } from "@/lib/db";
import { AnalyticsOverview } from "@/components/AnalyticsOverview";
import { AddExternalPost, ExternalPosts } from "@/components/ExternalPosts";
import { bounds } from "@/lib/range";
import { canWrite } from "@/lib/auth";
import { parseRange, uuidOrEmpty, type Preset } from "@/lib/range";
import { recommendAction, refreshStatsAction } from "@/lib/engage-actions";
import { PRICES, tokens as rub } from "@/lib/wallet";
import { SUPPORTED_CHANNELS } from "@/lib/publishing";
import { AiPanel } from "@/components/AiPanel";
import { KIND } from "@/components/ui";

import { HourChart, MembersChart, ShareDonut } from "@/components/AnalyticsCharts";
import { SubmitButton } from "@/components/SubmitButton";
const PRESETS: [Preset, string][] = [["month", "Текущий месяц"], ["today", "Сегодня"], ["yesterday", "Вчера"], ["7", "7 дней"], ["30", "30 дней"], ["all", "Всё время"]];

export default async function Analytics({ searchParams }: { searchParams: Promise<{ r?: string; d?: string; from?: string; to?: string; brand?: string; channel?: string; kind?: string }> }) {
  const sp = await searchParams;
  const c = await requireCtx();
  await requirePageFeature(c.org.id, "analytics");
  const rg = parseRange(sp, [...PRESETS.map(([k]) => k), "custom"], "month");
  const kind = sp.kind && Object.hasOwn(KIND, sp.kind) ? sp.kind : "";
  const [brands, channels] = await Promise.all([
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by created_at", [c.org.id]),
    q<{ id: string; title: string; kind: string }>("select id,title,kind from kz_channels where org_id=$1 order by created_at", [c.org.id]),
  ]);
  const brand = brands.some((x) => x.id === uuidOrEmpty(sp.brand)) ? sp.brand! : "", channel = channels.some((x) => x.id === uuidOrEmpty(sp.channel)) ? sp.channel! : "";
  const filter = { from: rg.from || undefined, to: rg.to || undefined, brand: brand || undefined, channel: channel || undefined, kind: kind || undefined };
  const [a, members] = await Promise.all([analytics(c.org.id, filter, true), membersReport(c.org.id)]);
  const posts = Number(a.tot.posts);
  const totals = { views: Number(a.tot.views), likes: Number(a.tot.likes), comments: Number(a.tot.comments), reposts: Number(a.tot.reposts) };
  const bound = recommendAction.bind(null, filter);
  const write = canWrite(c.org.role);
  const periodBounds = bounds(rg);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Аналитика</h1>
        {write && <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <form action={refreshStatsAction}><SubmitButton className="btn btn-ghost !rounded-xl"><RefreshCw size={15} />Обновить</SubmitButton></form>
          <AddExternalPost brands={brands} />
        </div>}
      </div>
      <AnalyticsOverview range={rg} presets={PRESETS} totals={totals} days={a.trend} filters={[
        { name: "channel", label: "Канал или социальная сеть", all: "Выбрать соц. сеть", value: channel, options: channels.map((x) => ({ value: x.id, label: `${SUPPORTED_CHANNELS[x.kind] ?? x.kind}: ${x.title}` })) },
        { name: "kind", label: "Формат контента", all: "Выбрать контент", value: kind, options: Object.entries(KIND).map(([k, v]) => ({ value: k, label: v })) },
        ...(brands.length > 1 ? [{ name: "brand", label: "Бренд", all: "Все бренды", value: brand, options: brands.map((x) => ({ value: x.id, label: x.name })) }] : []),
      ]} />
      <ExternalPosts orgId={c.org.id} from={periodBounds.from} to={periodBounds.to} brand={brand} channel={channel} format={kind} />
      {posts > 0 && <>
        <p className="mb-4 text-sm text-ink2">Публикаций: {posts.toLocaleString("ru-RU")}{a.clicks > 0 && ` · Переходов на сайт: ${a.clicks.toLocaleString("ru-RU")}`}</p>
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
                    {m.series.length > 1 && <div className="mt-3"><MembersChart series={m.series} /></div>}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-ink3">Число подписчиков записывается раз в сутки. График появится через пару дней после подключения канала.</p>
          </section>
        )}
        {write && <AiPanel title="Рекомендации ИИ" hint={`Разбор того, что работает, и что делать на следующей неделе · ${c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)}`} button="Получить рекомендации" action={bound} />}
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
        <div className="mb-6 grid gap-6 2xl:grid-cols-2">
          <section className="card p-5"><b className="mb-3 block text-sm">Просмотры по каналам</b><ShareDonut title="просмотров" items={a.byChannel.map((k) => ({ label: `${SUPPORTED_CHANNELS[k.kind] ?? k.kind}: ${k.title}`, value: Number(k.views) }))} /></section>
          <section className="card p-5"><b className="mb-3 block text-sm">Просмотры по форматам</b><ShareDonut title="просмотров" items={a.byKind.map((k) => ({ label: KIND[k.kind] ?? k.kind, value: Number(k.views) }))} /></section>
        </div>
        <section className="card mb-6 p-5">
          <b className="mb-1 block text-sm">Лучшее время публикации</b><p className="mb-4 text-xs text-ink2">Средние просмотры поста по часу выхода (МСК). Чем больше постов в часе, тем надёжнее вывод.</p>
          <HourChart hours={a.byHour.map((h) => ({ hour: h.hour, posts: Number(h.posts), avg: Number(h.avg) }))} />
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
      </>}
    </>
  );
}
