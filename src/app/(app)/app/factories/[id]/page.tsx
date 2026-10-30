import { notFound } from "next/navigation";
import { FactoryTabMemory } from "@/components/FactoryTabMemory";
import { PlanToolbar } from "@/components/PlanToolbar";
import { FactoryTabs } from "@/components/FactoryTabs";
import { DraftHost } from "@/components/DraftHost";
import { botConfigured, botLink, botUsername } from "@/lib/max-bot";
import { ItemModal } from "@/components/ItemModal";
import { listFactoryDrafts } from "@/lib/drafts";
import Link from "next/link";
import { Check, X, Sparkles, Pause, Play, Trash2, AlertTriangle, Send, ExternalLink, ImageIcon, RefreshCw, Plus, CalendarDays, List, Clock, Layers, Download } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { PRICES, rub } from "@/lib/wallet";
import { deleteFactory, generateImageAction, generateItemAction, generatePlanAction, publishNowAction, removeImageAction, saveBody, setFactoryChannels, setItemStatus, toggleFactory } from "@/lib/actions";
import { SUPPORTED_CHANNELS } from "@/lib/publishing";
import { addIdeaAction, addIdeasBulkAction, createMaterialsAction, repurposeAction, setRepeatAction, deleteIdeaAction, saveScheduleAction, updateIdeaAction } from "@/lib/plan-actions";
import { cleanKit } from "@/lib/images";
import { planRunway, KINDS, TIMEZONES } from "@/lib/plan";
import { CalendarGrid } from "@/components/CalendarGrid";
import { SlideEditor } from "@/components/SlideEditor";
import { ChannelChip } from "@/components/ChannelChip";
import { CopyText } from "@/components/CopyText";
import { ExportMenu } from "@/components/ExportMenu";
import { plainOf, type ExportItem } from "@/lib/exporter";
import { DocPanel } from "@/components/DocPanel";
import { GrowthPanel } from "@/components/GrowthPanel";
import { StrategyCard } from "@/components/StrategyCard";
import { ChannelForm } from "@/components/ChannelForm";
import { ImagePicker } from "@/components/ImagePicker";
import { ImageSlot } from "@/components/ImageSlot";
import { attachItemImageAction, reworkItemImageAction } from "@/lib/image-actions";
import { setItemDateAction } from "@/lib/growth-actions";
import { CreateMaterialForm } from "@/components/CreateMaterialForm";
import { SettingsList } from "@/components/ui/SettingsList";
import { ModalButton } from "@/components/ui/ModalButton";
import { Switch } from "@/components/ui/Switch";
import { planMatrix, strategyOf } from "@/lib/strategy";
import { abResult, type AbResult } from "@/lib/growth";
import { InfographicPanel } from "@/components/InfographicPanel";
import { PollPanel } from "@/components/PollPanel";
import type { Infographic } from "@/lib/carousel/infographic";
import { CarouselPanel, type CarouselMeta } from "@/components/CarouselPanel";
import { ContentSettingsCard } from "@/components/ContentSettingsCard";
import { cleanSettings } from "@/lib/postsettings";
import { cleanHtml, seoCheck, type SeoMeta } from "@/lib/seo";
import { updateSeoMetaAction } from "@/lib/actions";

// генерация идёт в server action этой страницы — нужен длинный лимит функции
export const maxDuration = 300;
import { Status, KIND, STATUS } from "@/components/ui";
import { FactoryRename } from "@/components/FactoryRename";
import { FactoryImagesToggle } from "@/components/FactoryImagesToggle";
import { OrgTabs } from "@/components/shell/OrgTabs";

import { SubmitButton } from "@/components/SubmitButton";
interface Pub { item_id: string; status: string; error: string | null; external_url: string | null; channel: string; kind: string }
const shiftMonth = (month: string, n: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

const toExp = (i: { kind: string; topic: string; hook: string; body: string; seo: { title: string; description?: string } | null; email: ExportItem["email"]; guide: ExportItem["guide"]; carousel: ExportItem["carousel"]; infographic: ExportItem["infographic"]; poll: ExportItem["poll"] }): ExportItem => ({ kind: i.kind, topic: i.topic, hook: i.hook, body: i.body, seo: i.seo, email: i.email, guide: i.guide, carousel: i.carousel, infographic: i.infographic, poll: i.poll });

interface Item { id: string; kind: string; topic: string; hook: string; body: string; status: string; planned_for: string | null; image_id: string | null; image_prompt: string | null; image_error: string | null; manual: boolean; seo: SeoMeta | null; carousel: CarouselMeta | null; client: string | null; repeat: { days: number; left: number } | null; repeat_of: string | null; infographic: Infographic | null; info_style: string | null; poll: { question: string; options: string[] } | null; ab: { variant: string; pair?: string } | null; variants: Record<string, string> | null; rubric: string | null; email: import("@/lib/docs").EmailMeta | null; guide: import("@/lib/docs").GuideMeta | null }

export default async function FactoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const err = sp.err, note = sp.note;
  const c = await requireCtx();
  const f = await one<{ id: string; name: string; brand: string; brand_id: string; status: string; niche: string; product: string }>(
    "select f.id,f.name,b.name brand,f.brand_id,f.status,f.niche,f.product from kz_factories f join kz_brands b on b.id=f.brand_id where f.id=$1 and f.org_id=$2", [id, c.org.id]);
  if (!f) notFound();
  const tab = sp.tab === "create" || sp.tab === "plan" || sp.tab === "settings" ? sp.tab : sp.open || sp.view || sp.kind || sp.status || sp.m ? "plan" : "settings";
  const view = sp.view === "calendar" ? "calendar" : "list";
  const kindF = KINDS.includes(sp.kind as never) ? sp.kind : "";
  const statusF = sp.status && STATUS[sp.status] ? sp.status : "";
  const lim = view === "list" ? Math.min(400, Math.max(20, Math.round(Number(sp.n)) || 20)) : 500;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : new Date().toISOString().slice(0, 7);
  const args: unknown[] = [id, c.org.id];
  const cond: string[] = [];
  if (kindF) { args.push(kindF); cond.push(`kind=$${args.length}`); }
  if (statusF) { args.push(statusF); cond.push(`status=$${args.length}`); }
  const items = tab !== "plan" ? [] : await q<Item>(
    `select id,kind,topic,hook,body,status,to_char(planned_for,'YYYY-MM-DD') planned_for,image_id,meta->>'imagePrompt' image_prompt,meta->>'imageError' image_error,coalesce((meta->>'manual')::boolean,false) manual,meta->'seo' seo,meta->'carousel' carousel,meta->'client'->>'verdict' client,meta->'repeat' repeat,meta->>'repeatOf' repeat_of,meta->'infographic' infographic,meta->>'infographicStyle' info_style,meta->'poll' poll,meta->'ab' ab,meta->'variants' variants,meta->>'rubric' rubric,meta->'email' email,meta->'guide' guide from kz_content_items where factory_id=$1 and org_id=$2 and not coalesce((meta->>'draft')::boolean,false) ${cond.map((x) => "and " + x).join(" ")} order by planned_for nulls last, created_at limit ${lim + 1}`, args);
  // список материалов подгружается порциями: тяжёлые карточки с формами не нужны все сразу
  const hasMore = view === "list" && items.length > lim;
  if (hasMore) items.length = lim;
  const carAssets = tab !== "plan" ? [] : await q<{ id: string; item_id: string }>("select id,item_id from kz_assets where org_id=$1 and position>=0 and item_id = any($2::uuid[]) order by item_id,position", [c.org.id, items.filter((x) => x.kind === "carousel" || x.kind === "infographic").map((x) => x.id)]);
  const fb = tab !== "plan" ? [] : await q<{ item_id: string; author: string; verdict: string; comment: string; created_at: string }>("select item_id,author,verdict,comment,created_at from kz_item_feedback where org_id=$1 and item_id = any($2::uuid[]) order by created_at", [c.org.id, items.map((x) => x.id)]);
  const brandColors = tab !== "plan" ? [] : cleanKit((await one<{ kit: unknown }>("select b.kit from kz_factories f join kz_brands b on b.id=f.brand_id where f.id=$1", [id]))?.kit).colors?.map((x) => x.hex) ?? [];
  const strategy = tab !== "settings" ? null : strategyOf((await one<{ brief: unknown }>("select brief from kz_factories where id=$1", [id]))?.brief);
  const matrix = strategy ? await planMatrix(id, strategy.rubrics) : null;
  const abMap = new Map<string, AbResult | null>(await Promise.all(items.filter((x) => x.ab?.pair).map(async (x) => [x.id, await abResult(c.org.id, x.id)] as const)));
  const st = cleanSettings(tab !== "settings" ? undefined : (await one<{ brief: unknown }>("select brief from kz_factories where id=$1", [id]))?.brief);
  const sched = await one<{ schedule: { days: number[]; times: string[]; tz: string }; formats: string[] }>("select schedule,formats from kz_factories where id=$1", [id]);
  const runway = tab !== "plan" ? null : await planRunway(id);
  const href = (o: Record<string, string>) => {
    const u = new URLSearchParams();
    const { err: _e, note: _n, open: _o, item: _i, ...keep } = sp; void _e; void _n; void _o; void _i;
    for (const [k, v] of Object.entries({ ...keep, tab: "plan", ...o })) if (v) u.set(k, v);
    return `/app/factories/${id}${u.size ? `?${u}` : ""}`;
  };
  const pubs = tab !== "plan" ? [] : await q<Pub>(
    `select p.item_id,p.status,p.error,p.external_url,ch.title channel,ch.kind from kz_publications p join kz_channels ch on ch.id=p.channel_id
      where p.org_id=$1 and p.item_id in (select id from kz_content_items where factory_id=$2)`, [c.org.id, id]);
  const chans = tab !== "settings" ? [] : await q<{ id: string; kind: string; title: string; on: boolean }>(
    `select ch.id,ch.kind,ch.title,(ch.id = any(fa.channel_ids)) "on" from kz_factories fa join kz_channels ch on ch.brand_id=fa.brand_id
      where fa.id=$1 and fa.org_id=$2 and ch.org_id=$2 order by ch.created_at`, [id, c.org.id]);
  const set = tab !== "settings" ? null : await one<{ autopublish: boolean; approval: string; images: boolean }>("select autopublish,approval,coalesce((brief->>'images')::boolean,false) images from kz_factories where id=$1", [id]);
  const hid = <input type="hidden" name="id" value={id} />;
  // вкладка: после создания и других действий возвращаемся в план (там открывается нужный материал)
  const stamp = Date.now();
  const itemId = /^[0-9a-f-]{36}$/.test(sp.item ?? "") ? sp.item! : "";
  // созданное «сразу» открывается окном (черновики), а не уходит в план
  const draftIds = (sp.draft ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const drafts = tab === "create" ? await listFactoryDrafts(c.org.id, id) : [];
  const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const scheduleSummary = sched ? `${[1, 2, 3, 4, 5, 6, 0].filter((d) => sched.schedule.days.includes(d)).map((d) => DAYS[d]).join(", ") || "дни не выбраны"} · ${sched.schedule.times.join(", ")}` : "не задано";
  // обычный пост — основной формат, поэтому он первый и выбран по умолчанию
  const planFormats = [...(sched?.formats?.length ? sched.formats : [...KINDS])].sort((a, b) => (a === "post" ? -1 : b === "post" ? 1 : 0));
  return (
    <>
      <FactoryTabMemory tab={tab} />
      <OrgTabs action={canWrite(c.org.role) ? <Link href="/app/factories/new" className="btn-rect">Создать завод<Plus size={16} /></Link> : null} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FactoryRename id={id} name={f.name} />
        <form action={toggleFactory}>{hid}<SubmitButton className="pill">{f.status === "active" ? <><Pause size={15} />Пауза</> : <><Play size={15} />Запустить</>}</SubmitButton></form>
        <form action={deleteFactory}>{hid}<SubmitButton data-confirm={`Удалить завод «${f.name}»? Будут удалены его план, материалы и настройки. Это действие нельзя отменить.`} className="grid size-10 place-items-center rounded-full bg-bad-soft text-bad transition hover:opacity-80" title="Удалить завод" aria-label="Удалить завод"><Trash2 size={15} /></SubmitButton></form>
      </div>
      {tab !== "settings" && <div className="mb-6"><FactoryTabs factoryId={id} tab={tab} /></div>}
      {note && !draftIds.length && <div className="mb-4 max-w-[680px] rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">{note}</div>}
      {err && !draftIds.length && <div className="mb-4 flex max-w-[680px] items-center gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{err}</div>}

      {tab === "create" && draftIds.length > 0 && <DraftHost orgId={c.org.id} ids={draftIds} returnTo={`/app/factories/${id}?tab=create`} err={err} note={note} free={c.org.unlimited} />}
      {tab === "create" && drafts.length > 0 && (
        <div className="mb-6 w-full max-w-[680px] space-y-2 rounded-[28px] bg-tile p-3">
          <b className="px-2 text-sm">Черновики ({drafts.length})</b>
          {drafts.map((d) => (
            <Link key={d.id} href={`/app/factories/${id}?tab=create&draft=${d.id}`} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-sm transition hover:opacity-80">
              <span className="chip">{KIND[d.kind] ?? d.kind}</span><span className="min-w-0 flex-1 truncate">{d.topic}</span><span className="text-xs text-ink3">{d.status === "ready" ? "готов" : d.status === "failed" ? "ошибка" : "создаётся"}</span>
            </Link>
          ))}
        </div>
      )}
      {tab === "create" && (
        <div className="mb-6 w-full max-w-[680px] rounded-[28px] bg-tile p-2.5">
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-semibold"><Sparkles size={16} />Создать материал</div>
          <div className="px-2 pb-2">
            <CreateMaterialForm factoryId={id} kinds={[...KINDS]} labels={KIND} defaultKind={sched?.formats?.[0] ?? "post"} createAction={createMaterialsAction} repurposeAction={repurposeAction} editPrice={c.org.unlimited ? "" : rub(PRICES.edit)}
              priceHint={`Каждый выбранный тип стоит как обычно (пост ${rub(PRICES.post)}, карусель ${rub(PRICES.carousel)}, SEO-статья ${rub(PRICES.seo)}). В режиме «сразу» первые три материала пишутся в этом окне, остальные в фоне; SEO-статья занимает 1–2 минуты.`}
              sourcePrice={c.org.unlimited ? "" : `${rub(PRICES.idea)} за материал.`} />
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="mb-6 w-full max-w-[680px]">
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

      {tab === "plan" && itemId && <ItemModal orgId={c.org.id} id={itemId} returnTo={href({})} err={err} note={note} canWrite={canWrite(c.org.role)} />}
      {tab === "plan" && (
        <div className={view === "calendar" ? "" : "w-full max-w-[680px]"}>
          {(runway === null || runway < 3) && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
              <AlertTriangle size={16} />{runway === null ? "В плане нет идей вперёд." : `План заканчивается через ${Math.max(runway, 0)} дн.`} Продлите его кнопкой «Продлить план».
            </div>
          )}
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            <ModalButton stamp={stamp} label="Добавить идею" title="Добавить свою идею в план">
              <p className="mb-3 text-sm text-ink2">Одна тема на один материал. Идея встаёт в план на выбранный день (или на ближайший свободный), а текст пишется после одобрения.</p>
        <form action={addIdeaAction} className="space-y-3">
          <input type="hidden" name="factory" value={id} />
                    <p className="text-xs text-ink2">Одна тема на один материал. Идея встаёт в план на выбранный день (или на ближайший свободный), а текст пишется после одобрения. Формат любой: пост, статья, карусель, опрос и другие.</p>
          <input name="topic" required minLength={3} maxLength={300} placeholder="Тема материала" className="input" />
          <input name="hook" maxLength={300} placeholder="Хук — первая строка (необязательно)" className="input" />
          <div className="flex flex-wrap items-center gap-2">
            <select name="kind" defaultValue={planFormats.includes("post") ? "post" : planFormats[0]} className="input !w-auto">{planFormats.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
            <input name="date" type="date" className="input !w-auto" title="Дата (если пусто — ближайший свободный день)" />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="approve" />сразу одобрить</label>
            <SubmitButton className="btn btn-ghost ml-auto"><Plus size={15} />Добавить</SubmitButton>
          </div>
        </form>
            </ModalButton>
            <ModalButton stamp={stamp} label="Добавить списком" title="Добавить несколько идей списком">
        <form action={addIdeasBulkAction} className="space-y-3">
          <input type="hidden" name="factory" value={id} />
                    <p className="text-xs text-ink2">Быстрый способ завести много тем сразу: каждая строка становится отдельной идеей в плане, дни подбираются сами.</p>
          <textarea name="list" rows={4} required placeholder={"По одной идее в строке. Можно с хуком через «|»:\n5 ошибок при планировании бюджета | Вы тоже так делаете?\nКак читать выписку из ЕГРН"} className="input text-xs" />
          <div className="flex flex-wrap items-center gap-2">
            <select name="kind" defaultValue={planFormats.includes("post") ? "post" : planFormats[0]} className="input !w-auto">{planFormats.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="approve" />сразу одобрить</label>
            <SubmitButton className="btn btn-ghost ml-auto"><Plus size={15} />Добавить список</SubmitButton>
          </div>
        </form>
            </ModalButton>
            <ModalButton stamp={stamp} label="Продлить план" title="Продлить план с помощью ИИ" icon={<Sparkles size={16} />}>
              <form action={generatePlanAction} className="space-y-4">
            {hid}
            <p className="text-sm text-ink2">Новые темы не повторяют уже существующие · {c.org.unlimited ? "бесплатно для админа" : `${rub(PRICES.plan_day)} за день`}</p>
            <select name="days" defaultValue="7" className="input">{[7, 14, 30].map((d) => <option key={d} value={d}>{d} дней{c.org.unlimited ? "" : ` — ${rub(d * PRICES.plan_day)}`}</option>)}</select>
            <SubmitButton className="btn btn-accent w-full justify-center"><Sparkles size={15} />Продлить</SubmitButton>
          </form>
            </ModalButton>
          </div>

      <PlanToolbar factoryId={id} view={view} kind={kindF ?? ""} status={statusF ?? ""} month={month}
        kinds={KINDS.map((k) => ({ value: k, label: KIND[k] }))} statuses={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }))}>
    <details className="relative">
      <summary className="pill pill-sm cursor-pointer list-none"><Download size={14} />Выгрузить всё</summary>
      <form action={`/api/export/factory/${id}`} method="get" className="absolute right-0 z-20 mt-1 w-72 space-y-2 rounded-xl border border-line bg-surface p-3 shadow-lg max-sm:fixed max-sm:inset-x-4 max-sm:w-auto">
        <p className="text-xs text-ink2">Материалы завода по фильтру: формат и статус из полей выше, период выбираете здесь.</p>
        <input type="hidden" name="kind" value={kindF ?? ""} /><input type="hidden" name="status" value={statusF ?? ""} />
        <div className="grid grid-cols-2 gap-2"><div><label className="label">С даты</label><input type="date" name="from" className="input !py-1.5" /></div><div><label className="label">По дату</label><input type="date" name="to" className="input !py-1.5" /></div></div>
        <select name="format" className="input"><option value="csv">Таблица для Excel (.csv)</option><option value="zip">Архив: тексты и картинки (.zip)</option></select>
        <SubmitButton className="btn w-full justify-center">Скачать</SubmitButton>
        <p className="text-xs text-ink3">CSV: до 300 материалов. ZIP: до 120 материалов и 40 МБ, папка на каждый.</p>
      </form>
    </details>
      </PlanToolbar>
      {view === "calendar" && (
        <CalendarGrid key={`${month}|${kindF ?? ""}|${statusF ?? ""}`} month={month} prevHref={href({ view: "calendar", m: shiftMonth(month, -1) })} nextHref={href({ view: "calendar", m: shiftMonth(month, 1) })}
          items={items.filter((i) => i.planned_for).map((i) => ({ id: i.id, date: i.planned_for!, kind: i.kind, topic: i.topic, status: i.status, href: href({ item: i.id }), movable: canWrite(c.org.role) && ["idea", "approved", "ready", "failed", "rejected"].includes(i.status) }))} />
      )}
      {view === "list" && items.length === 0 && <p className="card px-6 py-12 text-center text-sm text-ink2">{kindF || statusF ? "По этим фильтрам ничего нет." : "План пуст. Добавьте идею или нажмите «Продлить»."}</p>}
      <div className="space-y-3">
        {(view === "list" ? items : []).map((i) => sp.open !== i.id ? (
          // закрытый материал: лёгкая строка; тяжёлые формы редактирования строятся только у открытого (иначе страница весит мегабайты)
          <Link key={i.id} id={`i-${i.id}`} href={href({ open: i.id }) + `#i-${i.id}`} scroll={false} className="block rounded-3xl bg-tile p-2.5">
            <div className="flex cursor-pointer list-none flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3">
              <span className="w-14 shrink-0 text-xs text-ink3">{i.planned_for ? new Date(i.planned_for).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—"}</span>
              <span className="chip">{KIND[i.kind]}</span>
              <span className="min-w-[10rem] flex-1 basis-48 text-sm font-medium">{i.topic}{i.manual && <span className="ml-2 text-xs font-normal text-ink3">своя</span>}{i.repeat_of && <span className="ml-2 text-xs font-normal text-ink3">повтор</span>}{i.rubric && <span className="ml-2 rounded-full bg-tile px-2 py-0.5 text-[11px] font-normal text-ink2">{i.rubric}</span>}{i.ab && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-normal text-accent-ink">A/B {i.ab.variant === "A" ? "А" : "Б"}</span>}</span>
              {i.client && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${i.client === "approved" ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{i.client === "approved" ? "Клиент одобрил" : "Клиент просит правки"}</span>}
              <Status s={i.status} />
            </div>
          </Link>
        ) : (
          <details key={i.id} id={`i-${i.id}`} open={sp.open === i.id} className="group rounded-3xl bg-tile p-2.5 [&_.input]:bg-surface">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3">
              <span className="w-14 shrink-0 text-xs text-ink3">{i.planned_for ? new Date(i.planned_for).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—"}</span>
              <span className="chip">{KIND[i.kind]}</span>
              <span className="min-w-[10rem] flex-1 basis-48 text-sm font-medium">{i.topic}{i.manual && <span className="ml-2 text-xs font-normal text-ink3">своя</span>}{i.repeat_of && <span className="ml-2 text-xs font-normal text-ink3">повтор</span>}{i.rubric && <span className="ml-2 rounded-full bg-tile px-2 py-0.5 text-[11px] font-normal text-ink2">{i.rubric}</span>}{i.ab && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-normal text-accent-ink">A/B {i.ab.variant === "A" ? "А" : "Б"}</span>}</span>
              {i.client && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${i.client === "approved" ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{i.client === "approved" ? "Клиент одобрил" : "Клиент просит правки"}</span>}
              {(i.body.trim() || i.poll) && <CopyText icon text={plainOf(toExp(i))} label="Копировать текст" />}
              <Status s={i.status} />
            </summary>
            <div className="space-y-3 px-2.5 pb-2 pt-4">
              {["idea", "approved", "ready", "failed", "rejected"].includes(i.status) && canWrite(c.org.role) && (
                <form action={setItemDateAction} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3">
                  <input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} />
                  <label className="text-sm font-medium">Дата выхода в плане</label>
                  <input type="date" name="date" defaultValue={i.planned_for ?? ""} className="input !w-auto !py-1.5 text-sm" />
                  <SubmitButton className="pill pill-sm">Сохранить дату</SubmitButton>
                  <span className="text-xs text-ink3">Без даты материал встаёт на ближайший свободный день сам.</span>
                </form>
              )}
              {["idea", "approved", "ready", "failed", "rejected"].includes(i.status) ? (
                <details className="rounded-xl bg-tile p-3">
                  <summary className="cursor-pointer text-xs font-medium text-ink2">Изменить тему, хук, формат, дату</summary>
                  <form action={updateIdeaAction} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} />
                    <input name="topic" defaultValue={i.topic} required minLength={3} maxLength={300} className="input !bg-surface" />
                    <input name="hook" defaultValue={i.hook} maxLength={300} placeholder="Хук" className="input !bg-surface" />
                    <div className="flex flex-wrap items-center gap-2">
                      <select name="kind" defaultValue={i.kind} className="input !w-auto !bg-surface">{KINDS.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
                      <input name="date" type="date" defaultValue={i.planned_for ?? ""} className="input !w-auto !bg-surface" />
                      <SubmitButton className="btn btn-ghost !py-1.5">Сохранить</SubmitButton>
                    </div>
                  </form>
                </details>
              ) : null}
              {i.status === "published" && ["post", "carousel", "story"].includes(i.kind) && (
                <form action={setRepeatAction} className="flex flex-wrap items-center gap-2 rounded-xl bg-tile p-3 text-sm">
                  <input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} />
                  <b className="text-xs">Повторять материал</b>
                  <select name="days" defaultValue={String(i.repeat?.days ?? 0)} className="input !w-auto !bg-surface !py-1 text-xs"><option value="0">Не повторять</option><option value="30">Раз в 30 дней</option><option value="60">Раз в 60 дней</option><option value="90">Раз в 90 дней</option><option value="180">Раз в полгода</option></select>
                  <select name="times" defaultValue={String(Math.max(1, i.repeat?.left ?? 3))} className="input !w-auto !bg-surface !py-1 text-xs">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} раз</option>)}</select>
                  <SubmitButton className="btn btn-ghost !py-1">Сохранить</SubmitButton>
                  <span className="text-xs text-ink3">{i.repeat ? `Осталось повторов: ${i.repeat.left}. ` : ""}Копия появится готовой к публикации.</span>
                </form>
              )}
              {i.hook && <p className="text-sm text-ink2"><b>Хук:</b> {i.hook}</p>}
              {fb.some((f) => f.item_id === i.id) && (
                <div className="rounded-xl border border-line p-3">
                  <b className="text-sm">Ответы клиента</b>
                  <ul className="mt-2 space-y-2 text-sm">{fb.filter((f) => f.item_id === i.id).map((f, n) => (
                    <li key={n}><span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${f.verdict === "approved" ? "bg-good-soft text-good" : f.verdict === "changes" ? "bg-warn-soft text-warn" : "bg-tile text-ink2"}`}>{f.verdict === "approved" ? "Одобрено" : f.verdict === "changes" ? "Нужны правки" : "Комментарий"}</span><span className="text-xs text-ink3">{f.author || "Клиент"} · {new Date(f.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })}</span>{f.comment && <p className="mt-1 whitespace-pre-wrap text-ink2">{f.comment}</p>}</li>))}</ul>
                </div>
              )}
              {(i.body.trim() || i.poll || i.carousel || i.infographic) && (
                <div className="flex flex-wrap items-center gap-2">
                  <CopyText text={plainOf(toExp(i))} label="Копировать текст" />
                  {["seo", "email", "guide"].includes(i.kind) && <CopyText text={i.body} label="Копировать HTML" />}
                  <ExportMenu id={i.id} kind={i.kind} hasImages={!!i.image_id || carAssets.some((a) => a.item_id === i.id)} />
                </div>
              )}
              <GrowthPanel itemId={i.id} factoryId={id} kind={i.kind} status={i.status} hasBody={!!i.body.trim()} ab={i.ab} abRes={abMap.get(i.id) ?? null} variants={i.variants} free={c.org.unlimited} canEdit={canWrite(c.org.role)} aDate={i.planned_for} stamp={stamp} />
              {i.kind === "infographic" && i.infographic && (
                <InfographicPanel colors={brandColors} itemId={i.id} factoryId={id} info={i.infographic} style={i.info_style ?? "brand"} assetId={carAssets.find((a) => a.item_id === i.id)?.id} editable={["idea", "approved", "ready", "failed"].includes(i.status)} />
              )}
              {(i.kind === "email" || i.kind === "guide") && i.body && (i.kind === "email" ? i.email : i.guide) && <DocPanel itemId={i.id} factoryId={id} kind={i.kind} email={i.email} guide={i.guide} html={i.body} editable={["idea", "approved", "ready", "failed"].includes(i.status)} />}
              {i.kind === "poll" && i.poll && <PollPanel itemId={i.id} factoryId={id} poll={i.poll} editable={["idea", "approved", "ready", "failed"].includes(i.status)} />}
              {i.kind === "carousel" && i.carousel && carAssets.some((a) => a.item_id === i.id) && (
                <CarouselPanel caption={i.body} colors={brandColors} itemId={i.id} factoryId={id} meta={i.carousel} assets={carAssets.filter((a) => a.item_id === i.id)} editable={["idea", "approved", "ready", "failed"].includes(i.status)} free={c.org.unlimited} />
              )}
              {i.kind === "seo" && i.seo && i.body && (() => {
                const chk = seoCheck({ ...i.seo, keyword: i.seo.keyword || i.topic, faq: i.seo.faq ?? [] }, i.body);
                return (
                  <div className="space-y-3 rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm">SEO-проверка</b>
                      <span className={`chip ${chk.score >= 80 ? "!bg-good-soft !text-good" : chk.score >= 60 ? "!bg-warn-soft !text-warn" : "!bg-bad-soft !text-bad"}`}>{chk.score}%</span>
                      <a href={`/api/export/${i.id}`} className="btn btn-ghost ml-auto !py-1.5">Скачать HTML</a>
                    </div>
                    <ul className="grid gap-1 text-xs sm:grid-cols-2">{chk.checks.map((k) => <li key={k.label} className={k.ok ? "text-good" : "text-warn"}>{k.ok ? "✓" : "✗"} {k.label}{!k.ok && k.hint ? ` — ${k.hint}` : ""}</li>)}</ul>
                    <form action={updateSeoMetaAction} className="space-y-2">
                      <input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} />
                      <div><label className="label">Title ({i.seo.title.length})</label><input name="title" defaultValue={i.seo.title} maxLength={90} className="input" /></div>
                      <div><label className="label">Description ({i.seo.description.length})</label><textarea name="description" defaultValue={i.seo.description} rows={2} maxLength={200} className="input" /></div>
                      <div><label className="label">Адрес (slug)</label><input name="slug" defaultValue={i.seo.slug} maxLength={70} className="input font-mono text-xs" /></div>
                      <SubmitButton className="btn btn-ghost !py-1.5">Сохранить SEO-поля</SubmitButton>
                    </form>
                    <details><summary className="cursor-pointer text-xs font-medium text-ink2">Предпросмотр статьи</summary>
                      <article className="article mt-3 rounded-xl p-4" dangerouslySetInnerHTML={{ __html: `<h1>${i.seo.title.replace(/[<>&]/g, "")}</h1>${cleanHtml(i.body)}` }} />
                    </details>
                  </div>
                );
              })()}
              {i.body ? (
                <form action={saveBody} className="space-y-2">
                  <input type="hidden" name="id" value={i.id} />
                  <textarea name="body" defaultValue={i.body} rows={10} className="input font-mono !text-[13px]" />
                  <SubmitButton className="btn btn-ghost">{i.kind === "seo" ? "Сохранить HTML" : "Сохранить правки"}</SubmitButton>
                </form>
              ) : null}
              {i.image_error && <p className="flex items-center gap-1.5 text-xs text-warn"><AlertTriangle size={13} />Картинка: {i.image_error}</p>}
              {i.image_id && ["idea", "approved", "ready", "failed"].includes(i.status) && <SlideEditor itemId={i.id} targets={[{ key: "image", label: "Править картинку", assetId: i.image_id }]} colors={brandColors} />}
              {i.image_id && (
                <div className="flex flex-wrap items-start gap-3">
                  <ImageSlot src={`/api/assets/${i.image_id}`} alt="Картинка к материалу" replaceAction={attachItemImageAction} removeAction={removeImageAction} fields={<><input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} /></>} />
                  <a href={`/api/assets/${i.image_id}?dl=1`} download className="btn btn-ghost !py-1.5" title="Скачать картинку файлом"><Download size={14} />Скачать картинку</a>
                </div>
              )}
              {!["carousel", "infographic", "email", "guide", "reels"].includes(i.kind) && !["published", "scheduled", "generating"].includes(i.status) && (
                <div className="space-y-3 rounded-2xl bg-tile p-3">
                  <b className="text-sm">Своё изображение</b>
                  {!i.image_id && (
                    <form action={attachItemImageAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} />
                      <ImagePicker label="Прикрепить своё изображение" className="min-w-0" />
                      <SubmitButton className="pill pill-sm">Загрузить</SubmitButton>
                    </form>
                  )}
                  {i.image_id && (
                    <form action={reworkItemImageAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} />
                      <input name="instruction" required minLength={3} maxLength={400} placeholder="Доработать ИИ: убрать фон, добавить тёплые тона, сделать ярче…" className="input min-w-[14rem] flex-1 !bg-surface text-sm" />
                      <SubmitButton className="btn btn-accent !py-2"><Sparkles size={14} />Доработать{c.org.unlimited ? "" : ` · ${rub(PRICES.image)}`}</SubmitButton>
                    </form>
                  )}
                </div>
              )}
              {i.body && !["carousel", "infographic", "poll", "email", "guide", "reels"].includes(i.kind) && !["published", "scheduled", "generating"].includes(i.status) && (
                <form action={generateImageAction} className="space-y-2 rounded-xl bg-tile p-3">
                  <input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} />
                  <textarea name="prompt" rows={2} defaultValue="" placeholder={i.image_prompt ? `Прошлое описание: ${i.image_prompt.slice(0, 160)}…` : "Описание картинки (необязательно — иначе соберём из поста и брендбука)"} className="input !bg-surface text-xs" />
                  <SubmitButton className="btn btn-ghost !py-1.5">{i.image_id ? <RefreshCw size={14} /> : <ImageIcon size={14} />}{i.image_id ? "Создать заново" : "Создать картинку"}{c.org.unlimited ? "" : ` · ${rub(PRICES.image)}`}</SubmitButton>
                </form>
              )}
              {pubs.filter((p) => p.item_id === i.id).map((p, k) => (
                <p key={k} className="flex flex-wrap items-center gap-2 text-xs text-ink2">
                  <span className="chip">{SUPPORTED_CHANNELS[p.kind] ?? p.kind}: {p.channel}</span>
                  <span className={p.status === "published" ? "text-good" : p.status === "failed" ? "text-bad" : ""}>{({ queued: "в очереди", sending: "отправляется", published: "опубликовано", failed: "ошибка" } as Record<string, string>)[p.status]}</span>
                  {p.external_url && <a href={p.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-ink">открыть<ExternalLink size={12} /></a>}
                  {p.error && <span className="text-bad">{p.error}</span>}
                </p>
              ))}
              <div className="flex flex-wrap gap-2">
                {["ready", "failed"].includes(i.status) && i.body && !["email", "guide", "reels"].includes(i.kind) && <form action={publishNowAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} /><SubmitButton className="btn"><Send size={15} />Опубликовать сейчас</SubmitButton></form>}
                {["idea", "approved"].includes(i.status) && (<>
                  {i.status === "idea" && <form action={setItemStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="approved" /><SubmitButton className="btn btn-ghost"><Check size={15} />Одобрить</SubmitButton></form>}
                  <form action={setItemStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="rejected" /><SubmitButton className="btn btn-ghost"><X size={15} />Отклонить</SubmitButton></form>
                </>)}
                {["idea", "approved", "ready", "failed", "rejected"].includes(i.status) && <form action={deleteIdeaAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} /><SubmitButton data-confirm="Удалить материал из плана? Вернуть его будет нельзя." className="btn btn-danger" title="Удалить из плана"><Trash2 size={15} />Удалить</SubmitButton></form>}
                {["idea", "approved", "failed"].includes(i.status) && <form action={generateItemAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} /><SubmitButton className="btn btn-accent"><Sparkles size={15} />Написать</SubmitButton></form>}
              </div>
            </div>
          </details>
        ))}
      </div>
        {hasMore && <div className="mt-4 flex justify-center"><Link href={href({ n: String(lim + 20) }) + "#more"} scroll={false} className="pill">Показать ещё</Link></div>}
        </div>
      )}
    </>
  );
}
