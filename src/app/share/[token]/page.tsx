import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, MessageSquare, Pencil } from "lucide-react";
import { feedbackAction } from "@/lib/share-actions";
import { portalByToken, portalItems, portalReport } from "@/lib/share";
import { cleanKit } from "@/lib/images";
import { KIND } from "@/components/ui";

export const metadata: Metadata = { title: "Согласование и отчёт", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const VERDICT: Record<string, { t: string; cls: string }> = { approved: { t: "Одобрено", cls: "bg-good-soft text-good" }, changes: { t: "Нужны правки", cls: "bg-warn-soft text-warn" }, comment: { t: "Комментарий", cls: "bg-tile text-ink2" } };
const fmt = (n: number) => n.toLocaleString("ru-RU");
const when = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; err?: string }> }) {
  const { token } = await params;
  const { done, err } = await searchParams;
  const p = await portalByToken(token);
  if (!p) notFound();
  const kit = cleanKit(p.brand.kit);
  const accent = kit.colors?.[0]?.hex ?? "#029cda";
  const [items, rep] = await Promise.all([portalItems(p), p.link.show_report ? portalReport(p) : Promise.resolve(null)]);
  const maxV = Math.max(1, ...(rep?.byWeek.map((w) => w.views) ?? [1]));
  const img = (id: string) => `/api/share/${token}/asset/${id}`;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-line" style={{ borderTop: `4px solid ${accent}` }}>
        <div className="mx-auto max-w-3xl px-5 py-6">
          <p className="text-xs font-medium uppercase tracking-wider text-ink3">Согласование и отчёт</p>
          <h1 className="mt-1 text-2xl font-bold">{p.brand.name}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-10 px-5 py-8">
        {done && <p className="rounded-xl bg-good-soft px-4 py-3 text-sm text-good">Спасибо! Ответ отправлен команде.</p>}
        {err && <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}

        {rep && (
          <section aria-labelledby="rep">
            <h2 id="rep" className="mb-4 text-lg font-semibold">Результаты за 30 дней</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Публикаций", fmt(rep.posts)], ["Просмотров", fmt(rep.views)], ["Реакций", fmt(rep.reactions)], ["Вовлечённость", `${rep.er}%`]].map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-tile p-4"><div className="text-xs text-ink2">{l}</div><div className="mt-1 text-2xl font-semibold">{v}</div></div>
              ))}
            </div>
            {rep.channels.some((c) => c.members != null) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {rep.channels.filter((c) => c.members != null).map((c) => (
                  <div key={c.title} className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm">
                    <span>{c.title}</span><span className="font-semibold">{fmt(c.members!)} подписчиков{c.growth != null && <span className={`ml-2 text-xs ${c.growth >= 0 ? "text-good" : "text-bad"}`}>{c.growth >= 0 ? "+" : ""}{c.growth}</span>}</span>
                  </div>))}
              </div>
            )}
            {rep.byWeek.length > 0 && (
              <div className="mt-6 rounded-2xl border border-line p-4">
                <div className="mb-3 text-sm font-medium">Просмотры по неделям</div>
                <div className="flex h-28 items-end gap-2">{rep.byWeek.map((w) => (
                  <div key={w.week} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${w.week}: ${fmt(w.views)} просмотров, публикаций ${w.posts}`}>
                    <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (w.views / maxV) * 100)}%`, background: accent }} /><span className="text-[10px] text-ink3">{w.week}</span>
                  </div>))}</div>
              </div>
            )}
            {rep.top.length > 0 && (
              <div className="mt-6 overflow-hidden rounded-2xl border border-line">
                <div className="border-b border-line px-4 py-2.5 text-sm font-medium">Лучшие публикации</div>
                {rep.top.map((t, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 text-sm last:border-0">
                    <span className="chip">{KIND[t.kind] ?? t.kind}</span><span className="min-w-0 flex-1">{t.topic}</span>
                    <span className="font-medium">{fmt(t.views)} просм.</span><span className="text-xs text-ink2">{fmt(t.reactions)} реакций</span>
                  </div>))}
              </div>
            )}
            {rep.posts === 0 && <p className="mt-4 text-sm text-ink2">Публикаций за этот период пока нет. Статистика появится после первых постов.</p>}
          </section>
        )}

        <section aria-labelledby="mat">
          <h2 id="mat" className="mb-1 text-lg font-semibold">Материалы на согласование</h2>
          <p className="mb-5 text-sm text-ink2">{p.link.can_approve ? "Посмотрите материалы и нажмите «Одобрить» или опишите, что изменить." : "Здесь можно оставить комментарии к материалам."}</p>
          {items.length === 0 && <p className="rounded-2xl bg-tile p-6 text-center text-sm text-ink2">Сейчас нет материалов, ожидающих согласования.</p>}
          <div className="space-y-6">
            {items.map((i) => {
              const last = [...i.feedback].reverse().find((f) => f.verdict !== "comment");
              return (
                <article key={i.id} id={`i-${i.id}`} className="rounded-3xl border border-line p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="chip">{KIND[i.kind] ?? i.kind}</span>
                    {i.planned_for && <span className="text-xs text-ink3">План: {new Date(i.planned_for).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>}
                    {last && <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${VERDICT[last.verdict].cls}`}>{VERDICT[last.verdict].t}</span>}
                  </div>
                  <h3 className="text-base font-semibold">{i.topic}</h3>
                  {i.slides.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {i.slides.map((s, n) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={s} src={img(s)} alt={`Слайд ${n + 1}`} loading="lazy" className="h-64 w-auto shrink-0 rounded-xl border border-line" />))}
                    </div>
                  )}
                  {i.slides.length === 0 && i.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img(i.image)} alt="" loading="lazy" className="mt-3 max-h-80 w-auto rounded-xl border border-line" />)}
                  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{i.body}</p>

                  {i.feedback.length > 0 && (
                    <ul className="mt-4 space-y-2 border-t border-line pt-3">
                      {i.feedback.map((f, n) => (
                        <li key={n} className="text-sm"><span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT[f.verdict].cls}`}>{VERDICT[f.verdict].t}</span>
                          <span className="text-ink3">{f.author || "Клиент"} · {when(f.created_at)}</span>{f.comment && <p className="mt-1 whitespace-pre-wrap text-ink2">{f.comment}</p>}</li>))}
                    </ul>
                  )}

                  <form action={feedbackAction} className="mt-4 space-y-2 border-t border-line pt-4">
                    <input type="hidden" name="token" value={token} /><input type="hidden" name="item" value={i.id} />
                    <input name="author" maxLength={60} placeholder="Ваше имя (необязательно)" className="input" />
                    <textarea name="comment" rows={2} maxLength={1500} placeholder={p.link.can_approve ? "Комментарий или что изменить" : "Ваш комментарий"} className="input" />
                    <div className="flex flex-wrap gap-2">
                      {p.link.can_approve && <button name="verdict" value="approved" className="btn" style={{ background: "#1f9d57", color: "#fff" }}><Check size={15} />Одобрить</button>}
                      {p.link.can_approve && <button name="verdict" value="changes" className="btn btn-ghost"><Pencil size={14} />Нужны правки</button>}
                      <button name="verdict" value="comment" className="btn btn-ghost"><MessageSquare size={14} />Только комментарий</button>
                    </div>
                  </form>
                </article>
              );
            })}
          </div>
        </section>
      </main>
      <footer className="mx-auto max-w-3xl px-5 pb-10 text-xs text-ink3">Страница доступна только по этой ссылке. Если вы получили её по ошибке, просто закройте вкладку.</footer>
    </div>
  );
}
