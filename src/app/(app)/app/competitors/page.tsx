import { ExternalLink, RefreshCw, Trash2, Crosshair } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { competitorStats, MAX_COMPETITORS, topCompetitorPosts } from "@/lib/competitors";
import { addCompetitorAction, analyzeCompetitorsAction, competitorToPlanAction, deleteCompetitorAction, refreshCompetitorAction } from "@/lib/competitors-actions";
import { PRICES, rub } from "@/lib/wallet";
import { AiPanel } from "@/components/AiPanel";
import { Field, Form } from "@/components/Form";
import { Empty, PageHead } from "@/components/ui";

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("ru-RU"));

export default async function Competitors() {
  const c = await requireCtx();
  const write = canWrite(c.org.role);
  const [stats, top, brands, factories] = await Promise.all([
    competitorStats(c.org.id), topCompetitorPosts(c.org.id, 12),
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]),
    q<{ id: string; name: string }>("select id,name from kz_factories where org_id=$1 order by name", [c.org.id]),
  ]);
  return (
    <>
      <PageHead title="Конкуренты" sub="Следим за публичными каналами Telegram и сообществами VK: что у них заходит, как часто и когда они публикуют." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {stats.length === 0 ? <Empty icon={<Crosshair />} title="Конкурентов пока нет" text="Добавьте публичный канал Telegram или сообщество VK справа. Посты и просмотры подтянутся сразу и потом обновляются дважды в сутки." /> : (<>
            <div className="grid gap-3 sm:grid-cols-2">
              {stats.map((s) => (
                <div key={s.id} className="card p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{s.title}</div><div className="text-xs text-ink3">{s.kind === "telegram" ? "Telegram" : "VK"} · {s.ref}</div></div>
                    {write && <div className="flex gap-1">
                      <form action={refreshCompetitorAction}><input type="hidden" name="id" value={s.id} /><button className="text-ink3 hover:text-ink" title="Обновить"><RefreshCw size={15} /></button></form>
                      <form action={deleteCompetitorAction}><input type="hidden" name="id" value={s.id} /><button className="text-ink3 hover:text-bad" title="Удалить"><Trash2 size={15} /></button></form></div>}
                  </div>
                  {s.last_error && <p className="mt-2 rounded-lg bg-bad-soft px-2 py-1 text-xs text-bad">{s.last_error}</p>}
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[["Подписчики", fmt(s.members)], ["Постов в неделю", String(s.perWeek)], ["Просмотров на пост", fmt(s.avgViews)]].map(([l, v]) => (
                      <div key={l} className="rounded-xl bg-tile px-2 py-2"><dd className="text-base font-semibold">{v}</dd><dt className="text-[11px] text-ink2">{l}</dt></div>))}
                  </dl>
                  <p className="mt-2 text-xs text-ink2">{s.erPct != null && <>Охват поста ≈ {s.erPct}% подписчиков. </>}{s.bestHour != null && <>Лучше всего заходят публикации около {s.bestHour}:00 МСК.</>}</p>
                </div>
              ))}
            </div>
            {write && <AiPanel title="Разбор конкурентов" hint={`Что у них заходит, чем они сильнее и слабее вас, 5 идей для плана · ${c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)}`} button="Разобрать" action={analyzeCompetitorsAction} />}
            <section className="card">
              <div className="border-b border-line px-5 py-3 text-sm font-medium">Лучшие посты конкурентов за 60 дней</div>
              {top.length === 0 && <p className="px-5 py-6 text-sm text-ink2">Постов пока нет.</p>}
              {top.map((t) => (
                <div key={t.id} className="border-b border-line px-5 py-3 last:border-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink3"><span className="chip">{t.comp}</span><span>{new Date(t.at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span><b className="text-sm text-ink">{fmt(t.views)} просм.</b>
                    <a href={t.url} target="_blank" rel="noreferrer noopener" className="text-accent-ink"><ExternalLink size={12} /></a></div>
                  <p className="line-clamp-3 text-sm">{t.body}</p>
                  {write && factories.length > 0 && (
                    <Form action={competitorToPlanAction} submit="В план" variant="ghost" className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="post" value={t.id} />
                      <select name="factory" className="input !w-auto !py-1 text-xs">{factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                    </Form>
                  )}
                </div>
              ))}
              <p className="px-5 pb-3 text-xs text-ink3">«В план» создаёт идею, которую сервис напишет своими словами с позиции вашего бренда, без копирования.</p>
            </section>
          </>)}
        </div>
        <section className="card h-fit p-5">
          <b className="mb-3 block text-sm">Добавить конкурента</b>
          {write ? (
            <Form action={addCompetitorAction} submit="Добавить">
              <Field label="Площадка"><select name="kind" className="input"><option value="telegram">Telegram-канал</option><option value="vk">Сообщество VK</option></select></Field>
              <Field label="Ссылка или имя"><input name="input" required placeholder="@name, t.me/name или vk.com/name" className="input" /></Field>
              {brands.length > 0 && <Field label="Для какого бренда"><select name="brand" className="input"><option value="">Для всех брендов</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
              <p className="text-xs text-ink3">Только открытые источники. Максимум {MAX_COMPETITORS}. Для VK на сервере нужен ключ VK_SERVICE_TOKEN.</p>
            </Form>
          ) : <p className="text-sm text-ink2">Добавлять источники могут редакторы и выше.</p>}
        </section>
      </div>
    </>
  );
}
