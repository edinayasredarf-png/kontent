import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalFooter, PortalHeader } from "@/components/PortalChrome";
import { PrintButton } from "@/components/PrintButton";
import { KIND } from "@/components/ui";
import { cleanKit } from "@/lib/images";
import { portalByToken, portalReport } from "@/lib/share";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const p = await portalByToken((await params).token);
  return { title: { absolute: p ? `Отчёт: ${p.brand.name}` : "Страница недоступна" }, description: p ? `${p.brand.name}` : "", openGraph: { title: p?.brand.name ?? "", description: "", siteName: p?.wl.name || p?.brand.name || "" }, robots: { index: false, follow: false } };
}

const fmt = (n: number) => n.toLocaleString("ru-RU");

/** Отчёт клиенту: страница, оптимизированная под печать и «Сохранить как PDF». Период 30 или 90 дней. */
export default async function ReportPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ d?: string }> }) {
  const { token } = await params;
  const { d } = await searchParams;
  const p = await portalByToken(token);
  if (!p || !p.link.show_report) notFound();
  const days = d === "90" ? 90 : d === "7" ? 7 : 30;
  const rep = await portalReport(p, days);
  const accent = cleanKit(p.brand.kit).colors?.[0]?.hex ?? "#029cda";
  const maxV = Math.max(1, ...rep.byWeek.map((w) => w.views));
  const to = new Date(), from = new Date(Date.now() - days * 864e5);
  const period = `${from.toLocaleDateString("ru-RU")} — ${to.toLocaleDateString("ru-RU")}`;
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <PortalHeader p={p} token={token} eyebrow={`Отчёт за ${days} дней`} right={<div className="no-print"><PrintButton /></div>} />
      <main className="mx-auto max-w-3xl space-y-8 px-5 py-8">
        <div className="no-print flex flex-wrap items-center gap-1 text-sm">
          {[7, 30, 90].map((n) => <Link key={n} href={`/share/${token}/report?d=${n}`} className={`rounded-lg px-3 py-1.5 ${days === n ? "bg-tile font-medium" : "text-ink2 hover:bg-tile/60"}`}>{n} дней</Link>)}
          <Link href={`/share/${token}`} className="ml-auto text-ink2 hover:text-ink">← К материалам</Link>
        </div>
        <p className="text-sm text-ink2">Период: {period}</p>

        <section className="print-avoid">
          <h2 className="mb-3 text-lg font-semibold">Итоги</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Публикаций", fmt(rep.posts)], ["Просмотров", fmt(rep.views)], ["Реакций", fmt(rep.reactions)], ["Вовлечённость", `${rep.er}%`]].map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-line p-4"><div className="text-xs text-ink2">{l}</div><div className="mt-1 text-2xl font-semibold">{v}</div></div>))}
          </div>
          {rep.posts > 0 && <p className="mt-3 text-sm text-ink2">В среднем {fmt(Math.round(rep.views / rep.posts))} просмотров на публикацию.</p>}
        </section>

        {rep.channels.some((c) => c.members != null) && (
          <section className="print-avoid">
            <h2 className="mb-3 text-lg font-semibold">Аудитория</h2>
            <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-ink3"><th className="pb-2 font-normal">Канал</th><th className="pb-2 text-right font-normal">Подписчиков</th><th className="pb-2 text-right font-normal">За период</th></tr></thead>
              <tbody>{rep.channels.filter((c) => c.members != null).map((c) => (
                <tr key={c.title} className="border-b border-line"><td className="py-2">{c.title}</td><td className="py-2 text-right font-medium">{fmt(c.members!)}</td>
                  <td className={`py-2 text-right ${c.growth == null ? "text-ink3" : c.growth >= 0 ? "text-good" : "text-bad"}`}>{c.growth == null ? "нет данных" : `${c.growth >= 0 ? "+" : ""}${c.growth}`}</td></tr>))}</tbody></table>
          </section>
        )}

        {rep.byWeek.length > 0 && (
          <section className="print-avoid">
            <h2 className="mb-3 text-lg font-semibold">Просмотры по неделям</h2>
            <div className="flex h-36 items-end gap-2 rounded-2xl border border-line p-4">
              {rep.byWeek.map((w) => (
                <div key={w.week} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-ink2">{fmt(w.views)}</span>
                  <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (w.views / maxV) * 100)}%`, background: accent, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
                  <span className="text-[10px] text-ink3">{w.week}</span>
                </div>))}
            </div>
          </section>
        )}

        {rep.top.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Лучшие публикации</h2>
            <div className="overflow-hidden rounded-2xl border border-line">
              {rep.top.map((t, i) => (
                <div key={i} className="print-avoid flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 text-sm last:border-0">
                  <span className="chip">{KIND[t.kind] ?? t.kind}</span><span className="min-w-0 flex-1">{t.topic}</span>
                  <span className="font-medium">{fmt(t.views)} просм.</span><span className="text-xs text-ink2">{fmt(t.reactions)} реакций</span>
                </div>))}
            </div>
          </section>
        )}
        {rep.posts === 0 && <p className="rounded-2xl bg-tile p-6 text-center text-sm text-ink2">За этот период публикаций нет.</p>}
      </main>
      <PortalFooter p={p} />
    </div>
  );
}
