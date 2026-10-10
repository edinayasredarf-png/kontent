import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, X, Sparkles, Pause, Play, Trash2, AlertTriangle, Send, ExternalLink, ImageIcon, RefreshCw, Plus, CalendarDays, List, Clock, Layers } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { PRICES, rub } from "@/lib/wallet";
import { deleteFactory, generateImageAction, generateItemAction, generatePlanAction, publishNowAction, removeImageAction, saveBody, setFactoryChannels, setItemStatus, toggleFactory } from "@/lib/actions";
import { SUPPORTED_CHANNELS } from "@/lib/publishing";
import { addIdeaAction, addIdeasBulkAction, repurposeAction, setRepeatAction, deleteIdeaAction, saveScheduleAction, updateIdeaAction } from "@/lib/plan-actions";
import { planRunway, KINDS, TIMEZONES } from "@/lib/plan";
import { CalendarGrid } from "@/components/CalendarGrid";
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
import { PageHead, Status, KIND, STATUS } from "@/components/ui";

interface Pub { item_id: string; status: string; error: string | null; external_url: string | null; channel: string; kind: string }
const shiftMonth = (month: string, n: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

interface Item { id: string; kind: string; topic: string; hook: string; body: string; status: string; planned_for: string | null; image_id: string | null; image_prompt: string | null; image_error: string | null; manual: boolean; seo: SeoMeta | null; carousel: CarouselMeta | null; client: string | null; repeat: { days: number; left: number } | null; repeat_of: string | null; infographic: Infographic | null; info_style: string | null; poll: { question: string; options: string[] } | null }

export default async function FactoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const err = sp.err;
  const c = await requireCtx();
  const f = await one<{ id: string; name: string; brand: string; status: string; niche: string; product: string }>(
    "select f.id,f.name,b.name brand,f.status,f.niche,f.product from kz_factories f join kz_brands b on b.id=f.brand_id where f.id=$1 and f.org_id=$2", [id, c.org.id]);
  if (!f) notFound();
  const view = sp.view === "calendar" ? "calendar" : "list";
  const kindF = KINDS.includes(sp.kind as never) ? sp.kind : "";
  const statusF = sp.status && STATUS[sp.status] ? sp.status : "";
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : new Date().toISOString().slice(0, 7);
  const args: unknown[] = [id, c.org.id];
  const cond: string[] = [];
  if (kindF) { args.push(kindF); cond.push(`kind=$${args.length}`); }
  if (statusF) { args.push(statusF); cond.push(`status=$${args.length}`); }
  const items = await q<Item>(
    `select id,kind,topic,hook,body,status,to_char(planned_for,'YYYY-MM-DD') planned_for,image_id,meta->>'imagePrompt' image_prompt,meta->>'imageError' image_error,coalesce((meta->>'manual')::boolean,false) manual,meta->'seo' seo,meta->'carousel' carousel,meta->'client'->>'verdict' client,meta->'repeat' repeat,meta->>'repeatOf' repeat_of,meta->'infographic' infographic,meta->>'infographicStyle' info_style,meta->'poll' poll from kz_content_items where factory_id=$1 and org_id=$2 ${cond.map((x) => "and " + x).join(" ")} order by planned_for nulls last, created_at`, args);
  const carAssets = await q<{ id: string; item_id: string }>("select id,item_id from kz_assets where org_id=$1 and position>=0 and item_id = any($2::uuid[]) order by item_id,position", [c.org.id, items.filter((x) => x.kind === "carousel" || x.kind === "infographic").map((x) => x.id)]);
  const fb = await q<{ item_id: string; author: string; verdict: string; comment: string; created_at: string }>("select item_id,author,verdict,comment,created_at from kz_item_feedback where org_id=$1 and item_id = any($2::uuid[]) order by created_at", [c.org.id, items.map((x) => x.id)]);
  const st = cleanSettings((await one<{ brief: unknown }>("select brief from kz_factories where id=$1", [id]))?.brief);
  const sched = await one<{ schedule: { days: number[]; times: string[]; tz: string }; formats: string[] }>("select schedule,formats from kz_factories where id=$1", [id]);
  const runway = await planRunway(id);
  const href = (o: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...o })) if (v && k !== "err" && k !== "open") u.set(k, v);
    return `/app/factories/${id}${u.size ? `?${u}` : ""}`;
  };
  const pubs = await q<Pub>(
    `select p.item_id,p.status,p.error,p.external_url,ch.title channel,ch.kind from kz_publications p join kz_channels ch on ch.id=p.channel_id
      where p.org_id=$1 and p.item_id in (select id from kz_content_items where factory_id=$2)`, [c.org.id, id]);
  const chans = await q<{ id: string; kind: string; title: string; on: boolean }>(
    `select ch.id,ch.kind,ch.title,(ch.id = any(fa.channel_ids)) "on" from kz_factories fa join kz_channels ch on ch.brand_id=fa.brand_id
      where fa.id=$1 and fa.org_id=$2 and ch.org_id=$2 order by ch.created_at`, [id, c.org.id]);
  const set = await one<{ autopublish: boolean; approval: string; images: boolean }>("select autopublish,approval,coalesce((brief->>'images')::boolean,false) images from kz_factories where id=$1", [id]);
  const hid = <input type="hidden" name="id" value={id} />;
  return (
    <>
      <PageHead title={f.name} sub={`${f.brand}${f.niche ? " · " + f.niche : ""}`} action={
        <div className="flex gap-2">
          <form action={toggleFactory}>{hid}<button className="btn btn-ghost">{f.status === "active" ? <><Pause size={15} />Пауза</> : <><Play size={15} />Запустить</>}</button></form>
          <form action={deleteFactory}>{hid}<button className="btn btn-danger" title="Удалить завод"><Trash2 size={15} /></button></form>
        </div>} />
      {err && <div className="mb-4 flex items-center gap-2 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{err}</div>}
      <form action={setFactoryChannels} className="card mb-4 space-y-3 p-4">
        {hid}
        <div className="flex flex-wrap items-center gap-2"><b className="mr-2 text-sm">Публикация</b>
          {chans.length === 0 && <span className="text-sm text-ink2">У бренда нет каналов — подключите в разделе «Каналы».</span>}
          {chans.map((ch) => (
            <label key={ch.id} className="chip cursor-pointer !px-3 !py-1.5 has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink"><input type="checkbox" name="channels" value={ch.id} defaultChecked={ch.on} className="hidden" />{SUPPORTED_CHANNELS[ch.kind] ?? ch.kind}: {ch.title}</label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="autopublish" defaultChecked={set?.autopublish} />Автопубликация по расписанию</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="images" defaultChecked={set?.images} />Картинки к материалам{c.org.unlimited ? "" : ` (+${rub(PRICES.image)})`}</label>
          <label className="flex items-center gap-2">Идеи:<select name="approval" defaultValue={set?.approval} className="input !w-auto !py-1.5"><option value="manual">одобряю вручную</option><option value="auto">одобряются сами (полный автомат, план пополняется с баланса)</option></select></label>
          <button className="btn btn-ghost ml-auto">Сохранить</button>
        </div>
      </form>
      {(runway === null || runway < 3) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertTriangle size={16} />{runway === null ? "В плане нет идей вперёд." : `План заканчивается через ${Math.max(runway, 0)} дн.`} Продлите его — кнопка ниже.
        </div>
      )}
      <ContentSettingsCard factoryId={id} st={st} free={c.org.unlimited} />
      <details className="card mb-4 p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><Clock size={15} />Расписание публикаций</summary>
        <form action={saveScheduleAction} className="mt-4 space-y-3">
          <input type="hidden" name="factory" value={id} />
          <div className="flex flex-wrap gap-2">
            {[["1", "Пн"], ["2", "Вт"], ["3", "Ср"], ["4", "Чт"], ["5", "Пт"], ["6", "Сб"], ["0", "Вс"]].map(([v, l]) => (
              <label key={v} className="chip cursor-pointer !px-3 !py-1.5 has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink"><input type="checkbox" name="days" value={v} defaultChecked={sched?.schedule.days.includes(Number(v))} className="hidden" />{l}</label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="label">Время (через запятую)</label><input name="times" defaultValue={sched?.schedule.times.join(", ")} className="input !w-56" /></div>
            <div><label className="label">Часовой пояс</label><select name="tz" defaultValue={sched?.schedule.tz} className="input !w-auto">{Object.entries(TIMEZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <button className="btn btn-ghost">Сохранить расписание</button>
          </div>
          <p className="text-xs text-ink3">Новые идеи ставятся только на выбранные дни. Автопубликация выпускает материалы в указанное время по часовому поясу.</p>
        </form>
      </details>
      <details className="card mb-4 p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><Layers size={15} />Контент из одного источника: статья или текст → несколько материалов</summary>
        <form action={repurposeAction} className="mt-4 space-y-3">
          <input type="hidden" name="factory" value={id} />
          <p className="text-xs text-ink2">Дайте ссылку на статью или вставьте текст (блог, расшифровку вебинара, длинный пост). Сервис выделит разные мысли и предложит материалы с отдельным углом подачи. Тексты потом пишутся по фактам исходника.</p>
          <input name="url" type="url" maxLength={500} placeholder="Ссылка на статью (https://…)" className="input" />
          <textarea name="text" rows={5} maxLength={30000} placeholder="…или вставьте текст целиком (от 400 знаков)" className="input" />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">Сколько материалов
              <select name="count" defaultValue="5" className="input !w-auto">{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <button className="btn ml-auto"><Layers size={15} />Разобрать на материалы{c.org.unlimited ? "" : ` · ${rub(PRICES.idea)} за материал`}</button>
          </div>
          <p className="text-xs text-ink3">Идеи появятся в плане на ближайшие свободные дни. Создание самих постов и каруселей оплачивается как обычно.</p>
        </form>
      </details>
      <div className="card mb-4 grid gap-4 p-4 lg:grid-cols-2">
        <form action={addIdeaAction} className="space-y-2">
          <input type="hidden" name="factory" value={id} />
          <b className="text-sm">Своя идея</b>
          <input name="topic" required minLength={3} maxLength={300} placeholder="Тема материала" className="input" />
          <input name="hook" maxLength={300} placeholder="Хук — первая строка (необязательно)" className="input" />
          <div className="flex flex-wrap items-center gap-2">
            <select name="kind" className="input !w-auto">{(sched?.formats?.length ? sched.formats : [...KINDS]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
            <input name="date" type="date" className="input !w-auto" title="Дата (если пусто — ближайший свободный день)" />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="approve" />сразу одобрить</label>
            <button className="btn btn-ghost ml-auto"><Plus size={15} />Добавить</button>
          </div>
        </form>
        <form action={addIdeasBulkAction} className="space-y-2">
          <input type="hidden" name="factory" value={id} />
          <b className="text-sm">Список идей</b>
          <textarea name="list" rows={4} required placeholder={"По одной идее в строке. Можно с хуком через «|»:\n5 ошибок при планировании бюджета | Вы тоже так делаете?\nКак читать выписку из ЕГРН"} className="input text-xs" />
          <div className="flex flex-wrap items-center gap-2">
            <select name="kind" className="input !w-auto">{(sched?.formats?.length ? sched.formats : [...KINDS]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="approve" />сразу одобрить</label>
            <button className="btn btn-ghost ml-auto"><Plus size={15} />Добавить список</button>
          </div>
        </form>
      </div>
      <form action={generatePlanAction} className="card mb-6 flex flex-wrap items-center gap-3 p-4">
        {hid}
        <div className="mr-auto"><b className="text-sm">Продлить план с помощью ИИ</b><p className="text-xs text-ink2">Новые темы не повторяют уже существующие · {c.org.unlimited ? "бесплатно для админа" : `${rub(PRICES.plan_day)} за день`}</p></div>
        <select name="days" defaultValue="7" className="input !w-auto">{[7, 14, 30].map((d) => <option key={d} value={d}>{d} дней{c.org.unlimited ? "" : ` — ${rub(d * PRICES.plan_day)}`}</option>)}</select>
        <button className="btn btn-accent"><Sparkles size={15} />Продлить</button>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-tile p-1 text-sm">
          <Link href={href({ view: "list" })} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${view === "list" ? "bg-surface shadow-sm" : "text-ink2"}`}><List size={14} />Список</Link>
          <Link href={href({ view: "calendar" })} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${view === "calendar" ? "bg-surface shadow-sm" : "text-ink2"}`}><CalendarDays size={14} />Календарь</Link>
        </div>
        <form className="ml-auto flex flex-wrap items-center gap-2" action={`/app/factories/${id}`}>
          <input type="hidden" name="view" value={view} /><input type="hidden" name="m" value={month} />
          <select name="kind" defaultValue={kindF} className="input !w-auto !py-1.5"><option value="">Все форматы</option>{KINDS.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
          <select name="status" defaultValue={statusF} className="input !w-auto !py-1.5"><option value="">Все статусы</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <button className="btn btn-ghost !py-1.5">Применить</button>
        </form>
      </div>
      {view === "calendar" && (
        <CalendarGrid month={month} prevHref={href({ view: "calendar", m: shiftMonth(month, -1) })} nextHref={href({ view: "calendar", m: shiftMonth(month, 1) })}
          items={items.filter((i) => i.planned_for).map((i) => ({ id: i.id, date: i.planned_for!, kind: i.kind, topic: i.topic, status: i.status, href: href({ view: "list", open: i.id }) + `#i-${i.id}`, movable: canWrite(c.org.role) && ["idea", "approved", "ready", "failed", "rejected"].includes(i.status) }))} />
      )}
      {view === "list" && items.length === 0 && <p className="card px-6 py-12 text-center text-sm text-ink2">{kindF || statusF ? "По этим фильтрам ничего нет." : "План пуст. Добавьте идею или нажмите «Продлить»."}</p>}
      <div className="space-y-3">
        {(view === "list" ? items : []).map((i) => (
          <details key={i.id} id={`i-${i.id}`} open={sp.open === i.id} className="card group p-4 open:shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
              <span className="w-20 text-xs text-ink3">{i.planned_for ? new Date(i.planned_for).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—"}</span>
              <span className="chip">{KIND[i.kind]}</span>
              <span className="min-w-0 flex-1 text-sm font-medium">{i.topic}{i.manual && <span className="ml-2 text-xs font-normal text-ink3">своя</span>}{i.repeat_of && <span className="ml-2 text-xs font-normal text-ink3">повтор</span>}</span>
              {i.client && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${i.client === "approved" ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>{i.client === "approved" ? "Клиент одобрил" : "Клиент просит правки"}</span>}
              <Status s={i.status} />
            </summary>
            <div className="mt-4 space-y-3 border-t border-line pt-4">
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
                      <button className="btn btn-ghost !py-1.5">Сохранить</button>
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
                  <button className="btn btn-ghost !py-1">Сохранить</button>
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
              {i.kind === "infographic" && i.infographic && (
                <InfographicPanel itemId={i.id} factoryId={id} info={i.infographic} style={i.info_style ?? "brand"} assetId={carAssets.find((a) => a.item_id === i.id)?.id} editable={["idea", "approved", "ready", "failed"].includes(i.status)} />
              )}
              {i.kind === "poll" && i.poll && <PollPanel itemId={i.id} factoryId={id} poll={i.poll} editable={["idea", "approved", "ready", "failed"].includes(i.status)} />}
              {i.kind === "carousel" && i.carousel && carAssets.some((a) => a.item_id === i.id) && (
                <CarouselPanel itemId={i.id} factoryId={id} meta={i.carousel} assets={carAssets.filter((a) => a.item_id === i.id)} editable={["idea", "approved", "ready", "failed"].includes(i.status)} free={c.org.unlimited} />
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
                      <button className="btn btn-ghost !py-1.5">Сохранить SEO-поля</button>
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
                  <button className="btn btn-ghost">{i.kind === "seo" ? "Сохранить HTML" : "Сохранить правки"}</button>
                </form>
              ) : null}
              {i.image_error && <p className="flex items-center gap-1.5 text-xs text-warn"><AlertTriangle size={13} />Картинка: {i.image_error}</p>}
              {i.image_id && (
                <div className="flex flex-wrap items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${i.image_id}`} alt="Картинка к материалу" className="max-h-64 w-auto max-w-full rounded-xl border border-line" />
                  <form action={removeImageAction}><input type="hidden" name="id" value={i.id} /><button className="btn btn-danger !py-1.5" title="Убрать картинку"><Trash2 size={14} />Убрать</button></form>
                </div>
              )}
              {i.body && !["carousel", "infographic", "poll"].includes(i.kind) && !["published", "scheduled", "generating"].includes(i.status) && (
                <form action={generateImageAction} className="space-y-2 rounded-xl bg-tile p-3">
                  <input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} />
                  <textarea name="prompt" rows={2} defaultValue="" placeholder={i.image_prompt ? `Прошлое описание: ${i.image_prompt.slice(0, 160)}…` : "Описание картинки (необязательно — иначе соберём из поста и брендбука)"} className="input !bg-surface text-xs" />
                  <button className="btn btn-ghost !py-1.5">{i.image_id ? <RefreshCw size={14} /> : <ImageIcon size={14} />}{i.image_id ? "Создать заново" : "Создать картинку"}{c.org.unlimited ? "" : ` · ${rub(PRICES.image)}`}</button>
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
                {["ready", "failed"].includes(i.status) && i.body && <form action={publishNowAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} /><button className="btn"><Send size={15} />Опубликовать сейчас</button></form>}
                {["idea", "approved"].includes(i.status) && (<>
                  {i.status === "idea" && <form action={setItemStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="approved" /><button className="btn btn-ghost"><Check size={15} />Одобрить</button></form>}
                  <form action={setItemStatus}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="rejected" /><button className="btn btn-ghost"><X size={15} />Отклонить</button></form>
                </>)}
                {["idea", "approved", "ready", "failed", "rejected"].includes(i.status) && <form action={deleteIdeaAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} /><button className="btn btn-danger" title="Удалить из плана"><Trash2 size={15} />Удалить</button></form>}
                {["idea", "approved", "failed"].includes(i.status) && <form action={generateItemAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="factory" value={id} /><button className="btn btn-accent"><Sparkles size={15} />Написать</button></form>}
              </div>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
