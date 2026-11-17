import Link from "next/link";
import { notFound } from "next/navigation";
import { Pause, Play, Trash2, AlertTriangle, FileText } from "lucide-react";
import { FactoryTabMemory } from "@/components/FactoryTabMemory";
import { FactoryContentTabs, FactoryTabs } from "@/components/FactoryTabs";
import { DraftHost } from "@/components/DraftHost";
import { ContentStudio } from "@/components/ContentStudio";
import { ContentCalendar } from "@/components/ContentCalendar";
import { ContentPublications } from "@/components/ContentPublications";
import { PostCard, RoundIcon } from "@/components/ui/PostCard";
import { botConfigured, botLink, botUsername } from "@/lib/max-bot";
import { DRAFT, FACTORY_DRAFT_PAGE_SIZE, listFactoryDrafts } from "@/lib/drafts";
import { canWrite, requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { PRICES, tokens as rub } from "@/lib/wallet";
import { deleteFactory, setFactoryChannels, toggleFactory } from "@/lib/actions";
import { SUPPORTED_CHANNELS } from "@/lib/publishing";
import { saveScheduleAction } from "@/lib/plan-actions";
import { TIMEZONES } from "@/lib/plan";
import { ChannelChip } from "@/components/ChannelChip";
import { StrategyCard } from "@/components/StrategyCard";
import { ChannelForm } from "@/components/ChannelForm";
import { SettingsList } from "@/components/ui/SettingsList";
import { Switch } from "@/components/ui/Switch";
import { planMatrix, strategyOf } from "@/lib/strategy";
import { ContentSettingsCard } from "@/components/ContentSettingsCard";
import { cleanSettings } from "@/lib/postsettings";
import { Status, KIND } from "@/components/ui";
import { FactoryRename } from "@/components/FactoryRename";
import { FactoryImagesToggle } from "@/components/FactoryImagesToggle";
import { SubmitButton } from "@/components/SubmitButton";

export const maxDuration = 300;

export default async function FactoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const err = sp.err, note = sp.note;
  const c = await requireCtx();
  const f = await one<{ id: string; name: string; brand: string; brand_id: string; status: string; niche: string; product: string; brief: unknown; kit: unknown; schedule: { days: number[]; times: string[]; tz: string }; formats: string[]; autopublish: boolean; approval: string; images: boolean }>(
    "select f.id,f.name,b.name brand,f.brand_id,f.status,f.niche,f.product,f.brief,b.kit,f.schedule,f.formats,f.autopublish,f.approval,coalesce((f.brief->>'images')::boolean,false) images from kz_factories f join kz_brands b on b.id=f.brand_id where f.id=$1 and f.org_id=$2", [id, c.org.id]);
  if (!f) notFound();
  const tab = sp.tab === "drafts" ? "content"
    : sp.tab === "content" || sp.tab === "create" || sp.tab === "plan" || sp.tab === "settings" ? sp.tab
    : sp.open || sp.view || sp.kind || sp.status || sp.m ? "plan" : "settings";
  const isDrafts = tab === "content" && (sp.section === "drafts" || sp.tab === "drafts");
  const scope = { id, brandId: f.brand_id };
  const strategy = tab === "settings" ? strategyOf(f.brief) : null;
  const [matrix, chans] = await Promise.all([
    strategy ? planMatrix(id, strategy.rubrics) : null,
    tab === "settings" ? q<{ id: string; kind: string; title: string; on: boolean }>(
      `select ch.id,ch.kind,ch.title,(ch.id = any(fa.channel_ids)) "on" from kz_factories fa join kz_channels ch on ch.brand_id=fa.brand_id
        where fa.id=$1 and fa.org_id=$2 and ch.org_id=$2 order by ch.created_at`, [id, c.org.id]) : [],
  ]);
  const st = cleanSettings(f.brief);
  const sched = f, set = f;
  const hid = <input type="hidden" name="id" value={id} />;
  const stamp = Date.now();
  const selectedDrafts = (sp.draft ?? "").split(",").filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20);
  const draftIds = isDrafts && selectedDrafts.length
    ? (await q<{ id: string }>(`select id from kz_content_items where org_id=$1 and factory_id=$2 and id=any($3::uuid[]) and ${DRAFT}`, [c.org.id, id, selectedDrafts])).map(draft => draft.id)
    : [];
  const requestedPage = Number(sp.page);
  const draftPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 1000000) : 1;
  const draftHref = (page: number) => `/app/factories/${id}?tab=content&section=drafts&page=${page}`;
  const drafts = isDrafts ? await listFactoryDrafts(c.org.id, id, draftPage) : [];
  const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const scheduleSummary = sched ? `${[1, 2, 3, 4, 5, 6, 0].filter((d) => sched.schedule.days.includes(d)).map((d) => DAYS[d]).join(", ") || "дни не выбраны"} · ${sched.schedule.times.join(", ")}` : "не задано";
  return (
    <>
      <FactoryTabMemory tab={tab} />
      <FactoryTabs factoryId={id} brandId={f.brand_id} tab={tab} canCreate={canWrite(c.org.role)} />
      {(tab === "plan" || isDrafts) && <div className="mb-5"><FactoryContentTabs factoryId={id} section={isDrafts ? "drafts" : "plan"} /></div>}
      {tab === "settings" && <div className="mb-8 mt-6 flex max-w-[749px] flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0"><FactoryRename id={id} name={f.name} /></div>
        {canWrite(c.org.role) && <>
          <form action={toggleFactory}>{hid}<SubmitButton className="pill !bg-tile !text-ink">{f.status === "active" ? <><Pause size={15} />Пауза</> : <><Play size={15} />Запустить</>}</SubmitButton></form>
          <form action={deleteFactory}>{hid}<SubmitButton data-confirm={`Удалить завод «${f.name}»?`} className="grid size-10 place-items-center rounded-full bg-bad-soft text-bad hover:opacity-80" title="Удалить завод" aria-label="Удалить завод"><Trash2 size={15} /></SubmitButton></form>
        </>}
      </div>}
      {(tab === "settings" || isDrafts) && note && !draftIds.length && <div className="mb-4 max-w-[680px] rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">{note}</div>}
      {(tab === "settings" || isDrafts) && err && !draftIds.length && <div className="mb-4 flex max-w-[680px] items-center gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{err}</div>}

      {draftIds.length > 0 && <DraftHost orgId={c.org.id} ids={draftIds} returnTo={draftHref(draftPage)} err={err} note={note} free={c.org.unlimited} />}
      {isDrafts && (
        <div className="mb-6 w-full max-w-[600px] space-y-3">
          {drafts.length === 0 && <p className="p-3 text-sm text-ink2">{draftPage > 1 ? "На этой странице больше нет черновиков." : "У этого завода пока нет черновиков. Материалы появятся здесь после создания."}</p>}
          {drafts.slice(0, FACTORY_DRAFT_PAGE_SIZE).map(draft => (
            <Link key={draft.id} href={`${draftHref(draftPage)}&draft=${draft.id}`} scroll={false} className="block transition hover:opacity-90">
              <PostCard icon={<RoundIcon><FileText size={16} /></RoundIcon>} title={f.brand} sub={KIND[draft.kind] ?? draft.kind} actions={<Status s={draft.status} />}>
                <p className="text-sm">{draft.topic}</p>
              </PostCard>
            </Link>
          ))}
          {(draftPage > 1 || drafts.length > FACTORY_DRAFT_PAGE_SIZE) && <nav aria-label="Страницы черновиков" className="flex flex-wrap gap-2 px-2 py-1">
            {draftPage > 1 && <Link className="btn btn-ghost" href={draftHref(draftPage - 1)}>Назад</Link>}
            {drafts.length > FACTORY_DRAFT_PAGE_SIZE && <Link className="btn btn-ghost" href={draftHref(draftPage + 1)}>Дальше</Link>}
          </nav>}
        </div>
      )}
      {tab === "content" && !isDrafts && <ContentPublications sp={sp} scope={scope} />}
      {tab === "create" && <ContentStudio sp={sp} scope={scope} />}

      {tab === "settings" && (
        <div className="mb-6 w-full max-w-[749px]">
          <SettingsList stamp={stamp}
            items={[
              { label: "Каналы публикации", value: chans.filter((x) => x.on).map((x) => x.title).join(", ") || "не выбраны", modal: "publish" },
              { label: "Автопубликация по расписанию", value: set?.autopublish ? "Включена" : "Выключена", modal: "publish" },
              { label: "Картинки к материалам", value: set?.images ? "Да" : "Нет", modal: "publish", control: <FactoryImagesToggle id={id} on={!!set?.images} disabled={!canWrite(c.org.role)} /> },
              { label: "Утверждение идей", value: set?.approval === "auto" ? "Автоматически" : "Вручную", modal: "publish" },
              { label: "Расписание публикаций", value: scheduleSummary, modal: "schedule" },
              { label: "Контент-стратегия и рубрики", value: strategy ? `${strategy.rubrics.length} рубрик` : "не составлена", modal: "strategy" },
              { label: "Посты и карусели", value: `${st.slides} слайдов в карусели`, modal: "content" },
            ]}
            modals={{
              publish: { title: "Публикация", node: (
                <div className="space-y-5"><form action={setFactoryChannels} className="space-y-5">
                  {hid}
                  <div>
                    <span className="label">Куда публиковать</span>
                    <div className="flex flex-wrap gap-2">
                      {chans.length === 0 && <span className="text-sm text-ink2">У бренда нет каналов — подключите в разделе «Каналы».</span>}
                      {chans.map((ch) => <ChannelChip key={ch.id} id={ch.id} on={ch.on} auto={false} label={`${SUPPORTED_CHANNELS[ch.kind] ?? ch.kind}: ${ch.title}`} />)}
                    </div>
                  </div>
                  <div className="divide-y divide-line">
                    <Switch name="autopublish" defaultChecked={set?.autopublish} label="Автопубликация по расписанию" hint="Материалы выходят сами в заданное время." />
                    <Switch name="images" defaultChecked={set?.images} label="Картинки к материалам" hint={c.org.unlimited ? "Бесплатно для админа" : `+${rub(PRICES.image)} за картинку`} />
                  </div>
                  <div>
                    <label className="label">Утверждение идей</label>
                    <select name="approval" defaultValue={set?.approval} className="input"><option value="manual">Одобряю вручную</option><option value="auto">Одобряются сами (полный автомат, план пополняется с баланса)</option></select>
                  </div>
                  <SubmitButton className="btn btn-accent h-11 w-full justify-center">Сохранить</SubmitButton>
                </form>
                  <details className="rounded-2xl bg-tile p-3" open={chans.length === 0}>
                    <summary className="cursor-pointer text-sm font-medium">Подключить новый канал</summary>
                    <div className="mt-3"><ChannelForm brands={[{ id: f.brand_id, name: f.brand }]} maxBot={botConfigured() ? { link: botLink(), name: botUsername() } : undefined} factoryId={id} ret={`/app/factories/${id}?tab=settings`} /></div>
                    <p className="mt-3 text-xs text-ink3">Новый канал сразу включится в публикацию этого завода. Все каналы и их проверка: <Link href="/app/channels" className="text-accent-ink">раздел «Каналы»</Link>.</p>
                  </details>
                </div>) },
              schedule: { title: "Расписание публикаций", node: (
                <div>
        <form action={saveScheduleAction} className="space-y-4">
          <input type="hidden" name="factory" value={id} />
          <div className="flex flex-wrap gap-2">
            {[["1", "Пн"], ["2", "Вт"], ["3", "Ср"], ["4", "Чт"], ["5", "Пт"], ["6", "Сб"], ["0", "Вс"]].map(([v, l]) => (
              <label key={v} className="chip cursor-pointer !px-3 !py-1.5 chip-toggle"><input type="checkbox" name="days" value={v} defaultChecked={sched?.schedule.days.includes(Number(v))} className="hidden" />{l}</label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="label">Время (через запятую)</label><input name="times" defaultValue={sched?.schedule.times.join(", ")} className="input !w-56" /></div>
            <div><label className="label">Часовой пояс</label><select name="tz" defaultValue={sched?.schedule.tz} className="input !w-auto">{Object.entries(TIMEZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <SubmitButton className="btn btn-ghost">Сохранить расписание</SubmitButton>
          </div>
          <p className="text-xs text-ink3">Новые идеи ставятся только на выбранные дни. Автопубликация выпускает материалы в указанное время по часовому поясу.</p>
        </form>
                </div>) },
              strategy: { title: "Контент-стратегия и рубрики", wide: true, node: <StrategyCard bare factoryId={id} strategy={strategy} matrix={matrix} free={c.org.unlimited} /> },
              content: { title: "Посты и карусели", wide: true, node: <ContentSettingsCard bare factoryId={id} st={st} free={c.org.unlimited} /> },
            }} />
        </div>
      )}

      {tab === "plan" && <ContentCalendar sp={sp} scope={scope} />}
    </>
  );
}
