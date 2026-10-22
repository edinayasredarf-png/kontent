import { RefreshCw, Trash2, Crosshair } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { competitorStats, MAX_COMPETITORS, topCompetitorPosts } from "@/lib/competitors";
import { addCompetitorAction, analyzeCompetitorsAction, competitorToPlanAction, deleteCompetitorAction, refreshCompetitorAction } from "@/lib/competitors-actions";
import { PRICES, rub } from "@/lib/wallet";
import { AiPanel } from "@/components/AiPanel";
import { Field, Form } from "@/components/Form";
import { Empty, PageHead } from "@/components/ui";
import { ModalButton } from "@/components/ui/ModalButton";
import { PostCard, RoundIcon } from "@/components/ui/PostCard";

import { SubmitButton } from "@/components/SubmitButton";
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
      <PageHead title="Конкуренты" sub="Следим за публичными каналами Telegram, сообществами VK и сайтами: что у них выходит, как часто и что заходит лучше всего." />
      <div className="mx-auto w-full max-w-[600px]">
        <div className="space-y-6">
          {stats.length === 0 ? <Empty icon={<Crosshair />} title="Конкурентов пока нет" text="Добавьте публичный канал Telegram, сообщество VK или сайт кнопкой ниже. Материалы подтянутся сразу и потом обновляются дважды в сутки." /> : (<>
            <div className="space-y-3">
              {stats.map((s) => (
                <div key={s.id} className="card p-5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-center pl-10"><div className="truncate text-sm font-semibold">{s.title}</div><div className="text-xs text-ink3">{s.kind === "telegram" ? "Telegram" : s.kind === "vk" ? "VK" : "Сайт"} · {s.ref.replace(/^https?:\/\//, "")}</div></div>
                    {write && <div className="flex gap-1">
                      <form action={refreshCompetitorAction}><input type="hidden" name="id" value={s.id} /><SubmitButton className="text-ink3 hover:text-ink" title="Обновить"><RefreshCw size={15} /></SubmitButton></form>
                      <form action={deleteCompetitorAction}><input type="hidden" name="id" value={s.id} /><SubmitButton data-confirm="Удалить конкурента вместе с его постами?" className="text-ink3 hover:text-bad" title="Удалить"><Trash2 size={15} /></SubmitButton></form></div>}
                  </div>
                  {s.last_error && <p className="mt-2 rounded-lg bg-bad-soft px-2 py-1 text-xs text-bad">{s.last_error}</p>}
                  <dl className={`mt-3 grid gap-2 text-center ${s.kind === "site" ? "grid-cols-2" : "grid-cols-3"}`}>
                    {(s.kind === "site" ? [["Материалов за 30 дней", String(s.posts30)], ["Материалов в неделю", String(s.perWeek)]] : [["Подписчики", fmt(s.members)], ["Постов в неделю", String(s.perWeek)], ["Просмотров на пост", fmt(s.avgViews)]]).map(([l, v]) => (
                      <div key={l} className="rounded-xl bg-tile px-2 py-2"><dd className="text-base font-semibold">{v}</dd><dt className="text-[11px] text-ink2">{l}</dt></div>))}
                  </dl>
                  <p className="mt-3 text-center text-xs text-ink2">{s.erPct != null && <>Охват поста ≈ {s.erPct}% подписчиков. </>}{s.bestHour != null && <>Лучше всего заходят публикации около {s.bestHour}:00 МСК.</>}</p>
                </div>
              ))}
            </div>
            {write && <AiPanel title="Разбор конкурентов" hint={`Что у них заходит, чем они сильнее и слабее вас, 5 идей для плана · ${c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)}`} button="Разобрать" action={analyzeCompetitorsAction} />}
            <section>
              <h2 className="mb-3 text-sm font-semibold">Лучшие посты конкурентов за 60 дней</h2>
              {top.length === 0 && <p className="rounded-3xl bg-tile px-5 py-6 text-sm text-ink2">Постов пока нет.</p>}
              <div className="space-y-3">
                {top.map((t) => (
                  <PostCard key={t.id} icon={<RoundIcon>{t.comp.trim().charAt(0).toUpperCase()}</RoundIcon>} title={t.comp} sub={t.kind === "site" ? "сайт · открыть ↗" : `${fmt(t.views)} просмотров · открыть ↗`} subHref={t.url}
                    when={new Date(t.at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    actions={write && factories.length > 0 ? (
                      <Form action={competitorToPlanAction} submit="В план" variant="ghost" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="post" value={t.id} />
                        <select name="factory" className="input !w-auto !py-1 text-xs">{factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                      </Form>
                    ) : undefined}>
                    <p className="line-clamp-4 whitespace-pre-wrap text-sm">{t.body}</p>
                  </PostCard>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink3">«В план» создаёт идею, которую сервис напишет своими словами с позиции вашего бренда, без копирования.</p>
            </section>
          </>)}
        </div>
        <div className="mt-5 flex justify-center">
          <ModalButton label="Добавить конкурента" title="Добавить конкурента">
          {write ? (
            <Form action={addCompetitorAction} submit="Добавить">
              <Field label="Площадка"><select name="kind" className="input"><option value="telegram">Telegram-канал</option><option value="vk">Сообщество VK</option><option value="site">Сайт конкурента</option></select></Field>
              <Field label="Ссылка или имя"><input name="input" required placeholder="@name, vk.com/name или адрес сайта" className="input" /></Field>
              {brands.length > 0 && <Field label="Для какого бренда"><select name="brand" className="input"><option value="">Для всех брендов</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
              <p className="text-xs text-ink3">Только открытые источники, максимум {MAX_COMPETITORS}. Для сайта берём ленту RSS, а если её нет — заголовки материалов со страницы (укажите страницу со списком новостей или статей). Просмотров и подписчиков у сайта нет.</p>
            </Form>
          ) : <p className="text-sm text-ink2">Добавлять источники могут редакторы и выше.</p>}
          </ModalButton>
        </div>
      </div>
    </>
  );
}
