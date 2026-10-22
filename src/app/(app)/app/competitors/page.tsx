import Link from "next/link";
import { ChevronRight, Crosshair, Globe, Send, Users } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { groupSummaries, KIND_NAME, MAX_COMPETITORS, type CKind } from "@/lib/competitors";
import { addCompetitorAction, analyzeCompetitorsAction } from "@/lib/competitors-actions";
import { PRICES, rub } from "@/lib/wallet";
import { AiPanel } from "@/components/AiPanel";
import { Field, Form } from "@/components/Form";
import { Empty, PageHead } from "@/components/ui";
import { ModalButton } from "@/components/ui/ModalButton";
import { PlatformPicker } from "@/components/PlatformPicker";

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("ru-RU"));
const ago = (d: string | null) => {
  if (!d) return "—";
  const h = (Date.now() - new Date(d).getTime()) / 3_600_000;
  return h < 1 ? "только что" : h < 24 ? `${Math.floor(h)} ч назад` : `${Math.floor(h / 24)} дн. назад`;
};
const ICON: Record<CKind, typeof Send> = { telegram: Send, vk: Users, site: Globe };

export default async function Competitors() {
  const c = await requireCtx();
  const write = canWrite(c.org.role);
  const [groups, brands] = await Promise.all([
    groupSummaries(c.org.id),
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]),
  ]);
  const platforms = groups.reduce((a, g) => a + g.platforms.length, 0);
  return (
    <>
      <PageHead title="Конкуренты" sub="Следим за конкурентами на всех площадках: Telegram, VK и сайты. Что у них выходит, как часто и что заходит лучше всего." />
      <div className="mx-auto -mt-3 mb-6 flex w-full max-w-[680px] flex-wrap items-center justify-center gap-3">
        {write && (
          <ModalButton label="Добавить конкурента" title="Добавить конкурента" className="pill pill-on">
            <Form action={addCompetitorAction} submit="Добавить">
              <Field label="Название конкурента"><input name="name" maxLength={80} placeholder="Например: DATUM Group (если пусто — возьмём с площадки)" className="input" /></Field>
              <PlatformPicker label="Первая площадка" />
              {brands.length > 0 && <Field label="Для какого бренда"><select name="brand" className="input"><option value="">Для всех брендов</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
              <p className="text-xs text-ink3">Только открытые источники, максимум {MAX_COMPETITORS} конкурентов. Остальные площадки (соцсети, сайт) добавляются на странице конкурента.</p>
            </Form>
          </ModalButton>
        )}
        {groups.length > 0 && <span className="text-sm text-ink2">Конкурентов: <b>{groups.length}</b> · подключено площадок: <b>{platforms}</b></span>}
      </div>

      <div className="mx-auto w-full max-w-[680px] space-y-5">
        {groups.length === 0 ? <Empty icon={<Crosshair />} title="Конкурентов пока нет" text="Нажмите «Добавить конкурента»: укажите название и первую площадку (канал Telegram, сообщество VK или сайт). Остальные площадки добавите на его странице." /> : (<>
          <div className="space-y-4">
            {groups.map((g) => (
              <Link key={g.id} href={`/app/competitors/${g.id}`} className="card block p-5 transition hover:shadow-float">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold">{g.name}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.platforms.map((p) => { const I = ICON[p.kind]; return <span key={p.id} className={`chip inline-flex items-center gap-1 ${p.last_error ? "!bg-bad-soft !text-bad" : ""}`} title={p.last_error ?? p.title}><I size={12} />{KIND_NAME[p.kind]}</span>; })}
                    </div>
                  </div>
                  <span className="mt-1 inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent-ink">Открыть<ChevronRight size={15} /></span>
                </div>
                {g.errors > 0 && <p className="mt-3 rounded-lg bg-bad-soft px-2 py-1 text-xs text-bad">Площадок с ошибкой загрузки: {g.errors}. Подробности внутри.</p>}
                <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  {[["Подписчики", fmt(g.members)], ["Публикаций в неделю", String(g.perWeek)], ["Просмотров на пост", g.avgViews ? fmt(g.avgViews) : "—"], ["Последняя публикация", ago(g.lastPostAt)]].map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-tile px-2 py-2.5"><dd className="text-base font-semibold">{v}</dd><dt className="text-[11px] leading-tight text-ink2">{l}</dt></div>))}
                </dl>
                {g.bestHour != null && <p className="mt-3 text-xs text-ink2">Лучше всего заходят публикации около {g.bestHour}:00 МСК.</p>}
                {g.best && <p className="mt-2 line-clamp-2 rounded-xl bg-tile px-3 py-2 text-xs text-ink2"><b className="text-ink">Лучший пост{g.best.views ? ` · ${fmt(g.best.views)} просм.` : ""}:</b> {g.best.body}</p>}
              </Link>
            ))}
          </div>
          {write && <AiPanel title="Разбор конкурентов" hint={`Что у них заходит, чем они сильнее и слабее вас, 5 идей для плана · ${c.org.unlimited ? "бесплатно для админа" : rub(PRICES.digest)}`} button="Разобрать" action={analyzeCompetitorsAction} />}
        </>)}
      </div>
    </>
  );
}
