import { AutoTextarea } from "@/components/AutoTextarea";
import { ImagePicker } from "@/components/ImagePicker";
import { ImageSlot } from "@/components/ImageSlot";
import { attachFlowImageAction, removeFlowImageAction, reworkFlowImageAction } from "@/lib/image-actions";
import { PostText } from "@/components/monitor/PostText";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Pause, Play, RefreshCw, Trash2, Sparkles } from "lucide-react";
import { requireCtx, canWrite } from "@/lib/auth";
import { q, one } from "@/lib/db";
import { approveFlowItemAction, deleteFlowAction, rejectFlowItemAction, rescueFlowItemAction, rewriteFlowItemAction, saveFlowSettingsAction, toggleFlowAction } from "@/lib/flows/actions";
import { cleanFlowSettings, REJECT, SCOPES, TOPICS, TYPES } from "@/lib/flows/settings";
import { KIND_LABEL, type Kind } from "@/lib/monitor/fetchers";
import { PRICES, rub } from "@/lib/wallet";
import { SUPPORTED_CHANNELS } from "@/lib/publishing";
import { PageHead } from "@/components/ui";
import { NewsCard, type NewsSource } from "@/components/monitor/NewsCard";
import { FadeList } from "@/components/monitor/FadeList";

import { SubmitButton } from "@/components/SubmitButton";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const TABS: [string, string][] = [["pending", "Очередь"], ["queued", "Опубликовано"], ["rejected", "Отбракованные"], ["settings", "Настройки"], ["cost", "Расход"]];
const when = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export default async function FlowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; err?: string; note?: string; n?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.t) ? sp.t! : "pending";
  const lim = Math.min(300, Math.max(15, Math.round(Number(sp.n)) || 15));
  const c = await requireCtx();
  const flow = await one<{ id: string; name: string; status: string; settings: unknown; source_ids: string[]; channel_ids: string[]; brand: string; note: string }>(
    "select f.id,f.name,f.status,f.settings,f.source_ids,f.channel_ids,b.name brand,f.note from kz_flows f join kz_brands b on b.id=f.brand_id where f.id=$1 and f.org_id=$2", [id, c.org.id]);
  if (!flow) notFound();
  const st = cleanFlowSettings(flow.settings), write = canWrite(c.org.role);
  const counts = Object.fromEntries((await q<{ g: string; n: string }>("select case when status in ('pending','ready') then 'pending' else status end g,count(*) n from kz_flow_items where flow_id=$1 group by 1", [id])).map((r) => [r.g, Number(r.n)]));
  const hid = (item: string) => (<><input type="hidden" name="flow" value={id} /><input type="hidden" name="item" value={item} /><input type="hidden" name="tab" value={tab} /></>);

  return (
    <>
      <Link href="/app/flows" className="mb-1 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Все потоки</Link>
      <PageHead title={flow.name} sub={`${flow.brand} · ${st.mode === "auto" ? "публикует автоматически" : "каждая новость ждёт вашего одобрения"}`} />
      <div className="mx-auto -mt-3 mb-6 flex flex-wrap items-center justify-center gap-2">
        <nav className="inline-flex max-w-full items-center overflow-x-auto rounded-full bg-tile p-1 text-sm no-scrollbar">{TABS.map(([k, l]) => (
          <Link key={k} href={`/app/flows/${id}?t=${k}`} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 transition ${tab === k ? "bg-surface font-semibold shadow-sm" : "text-ink2 hover:text-ink"}`}>{l}{counts[k] ? <span className="text-xs font-normal text-ink3">{counts[k]}</span> : null}</Link>
        ))}</nav>
        {write && <>
          <form action={toggleFlowAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="tab" value={tab} /><SubmitButton className="pill">{flow.status === "active" ? <><Pause size={15} />Пауза</> : <><Play size={15} />Включить</>}</SubmitButton></form>
          <form action={deleteFlowAction}><input type="hidden" name="id" value={id} /><SubmitButton data-confirm="Удалить поток? Очередь, отбракованные и история отбора будут удалены. Это действие нельзя отменить." className="grid size-10 place-items-center rounded-full bg-bad-soft text-bad transition hover:opacity-80" title="Удалить поток" aria-label="Удалить поток"><Trash2 size={15} /></SubmitButton></form>
        </>}
      </div>
      {sp.err && <p className="mx-auto mb-4 max-w-[680px] rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{sp.err}</p>}
      {sp.note && <p className="mx-auto mb-4 max-w-[680px] rounded-2xl bg-good-soft px-4 py-3 text-sm text-good">{sp.note}</p>}
      {flow.note && <p className="mx-auto mb-4 max-w-[680px] rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">{flow.note}</p>}
      {flow.status !== "active" && <p className="mx-auto mb-4 max-w-[680px] rounded-2xl bg-tile px-4 py-3 text-sm text-ink2">Поток на паузе: новости не обрабатываются. Проверьте настройки и нажмите «Включить».</p>}
      {tab === "pending" && <Pending flowId={id} write={write} hid={hid} unlimited={c.org.unlimited} lim={lim} />}
      {tab === "queued" && <Published flowId={id} lim={lim} />}
      {tab === "rejected" && <Rejected flowId={id} write={write} hid={hid} unlimited={c.org.unlimited} lim={lim} />}
      {tab === "cost" && <Cost flowId={id} />}
      {tab === "settings" && <div className={COL}><Settings flowId={id} name={flow.name} st={st} sourceIds={flow.source_ids} channelIds={flow.channel_ids} orgId={c.org.id} write={write} /></div>}
    </>
  );
}

type Hid = (item: string) => React.ReactNode;

const COL = "mx-auto w-full max-w-[680px]";
const SRC = "s.kind,s.title source,s.ref,s.config";
type Src = { kind: Kind; source: string; ref: string; config: Record<string, unknown> | null };
const srcOf = (r: Src): NewsSource => ({ kind: r.kind, title: r.source, ref: r.ref, config: r.config });
const Empty = ({ t }: { t: string }) => <p className="card mx-auto max-w-[600px] px-6 py-12 text-center text-sm text-ink2">{t}</p>;

async function Pending({ flowId, write, hid, unlimited, lim }: { flowId: string; write: boolean; hid: Hid; unlimited: boolean; lim: number }) {
  const rows = await q<Src & { id: string; text: string; status: string; created_at: string; title: string; body: string; url: string; cls: { type?: string; topic?: string; scope?: string; fit?: number; imageId?: string } | null }>(
    `select i.id,i.text,i.status,i.created_at,k.title,k.body,k.url,${SRC},i.classification cls from kz_flow_items i join kz_feed_items k on k.id=i.feed_item_id join kz_sources s on s.id=k.source_id
      where i.flow_id=$1 and i.status in ('pending','ready') order by i.created_at desc limit ${lim + 1}`, [flowId]);
  const more = rows.length > lim; if (more) rows.length = lim;
  if (!rows.length) return <Empty t="Очередь пуста. Новые новости появятся здесь после отбора и пересказа (проверка источников каждые 5 минут)." />;
  return (
    <>
    <FadeList className={`${COL} space-y-5 pb-16`}>{rows.map((r) => (
      <NewsCard key={r.id} s={srcOf(r)} when={when(r.created_at)}
        actions={write ? (<>
          <form action={rewriteFlowItemAction} className="flex flex-wrap items-center gap-2">{hid(r.id)}
            <input name="note" maxLength={300} placeholder="Пожелание: короче, с юмором…" className="input !w-52 !rounded-full !bg-surface !py-1.5 text-xs" />
            <SubmitButton className="grid h-8 place-items-center rounded-full bg-surface px-3 text-xs font-medium hover:bg-tile2"><span className="flex items-center gap-1"><RefreshCw size={13} />Переписать{unlimited ? "" : ` · ${rub(PRICES.flowRewrite)}`}</span></SubmitButton></form>
          <form action={rejectFlowItemAction} className="ml-auto">{hid(r.id)}<SubmitButton className="h-8 rounded-full bg-surface px-3 text-xs font-medium text-bad hover:bg-tile2">Отклонить</SubmitButton></form>
        </>) : undefined}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          {r.cls?.topic && <span className="chip !bg-surface">{r.cls.topic}</span>}{r.cls?.fit != null && <span className="chip !bg-surface">нашесть {r.cls.fit}/10</span>}
          {r.status === "ready" && <span className="chip !bg-accent-soft !text-accent-ink">выйдет по расписанию</span>}
          <a href={r.url.startsWith("http") ? r.url : undefined} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1 text-accent-ink">оригинал<ExternalLink size={11} /></a>
        </div>
        <details className="mb-3 text-xs text-ink2"><summary className="cursor-pointer">Исходная новость</summary><p className="mt-1 whitespace-pre-wrap break-words">{r.body && r.body.length >= r.title.length ? r.body : r.title}</p></details>
        {write ? (
          <form action={approveFlowItemAction} className="space-y-2">
            {hid(r.id)}
            <AutoTextarea name="text" defaultValue={r.text} rows={7} className="input !rounded-2xl !bg-surface text-sm leading-6" />
            <div className="space-y-2 rounded-2xl bg-surface p-3">
              <b className="text-xs font-semibold text-ink2">Изображение к посту</b>
              {r.cls?.imageId ? (
                <div className="space-y-2">
                  <ImageSlot inForm src={`/api/assets/${r.cls.imageId}`} alt="Изображение к посту" replaceAction={attachFlowImageAction} removeAction={removeFlowImageAction} removeConfirm="Убрать изображение у этого поста?" />
                  <div className="flex flex-wrap items-center gap-2">
                    <input name="instruction" maxLength={400} placeholder="Доработать ИИ: убрать фон, добавить тёплые тона…" className="input min-w-[12rem] flex-1 !bg-tile text-xs" />
                    <SubmitButton formAction={reworkFlowImageAction} className="grid h-8 place-items-center rounded-full bg-accent px-3 text-xs font-medium text-white hover:opacity-90"><span className="flex items-center gap-1"><Sparkles size={13} />Доработать{unlimited ? "" : ` · ${rub(PRICES.image)}`}</span></SubmitButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <ImagePicker label="Прикрепить своё изображение" className="min-w-0" />
                  <SubmitButton formAction={attachFlowImageAction} className="pill pill-sm" title="Сохранить изображение, чтобы доработать его ИИ">Загрузить</SubmitButton>
                </div>
              )}
              <p className="text-[11px] text-ink3">Своё изображение уйдёт вместе с постом и заменит картинку из источника. Текст выше при этом сохраняется.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2"><SubmitButton className="btn !h-9">Опубликовать</SubmitButton><span className="text-xs text-ink3">текст можно править перед публикацией</span></div>
          </form>
        ) : <p className="whitespace-pre-wrap text-sm leading-6">{r.text}</p>}
      </NewsCard>
    ))}</FadeList>
    {more && <div className="mt-2 flex justify-center pb-10"><Link href={`/app/flows/${flowId}?t=pending&n=${lim + 15}`} scroll={false} className="pill">Показать ещё</Link></div>}
    </>
  );
}

async function Published({ flowId, lim }: { flowId: string; lim: number }) {
  const rows = await q<Partial<Src> & { id: string; text: string; updated_at: string; note: string | null; status: string; urls: string | null; pub: string | null }>(
    `select i.id,i.text,i.updated_at,i.reject_note note,ci.status,s.kind,s.title source,s.ref,s.config,
            (select string_agg(p.external_url,' ') from kz_publications p where p.item_id=i.content_item_id and p.external_url is not null) urls,
            (select string_agg(distinct p.status,',') from kz_publications p where p.item_id=i.content_item_id) pub
       from kz_flow_items i left join kz_content_items ci on ci.id=i.content_item_id left join kz_feed_items k on k.id=i.feed_item_id left join kz_sources s on s.id=k.source_id
      where i.flow_id=$1 and i.status in ('queued','failed') order by i.updated_at desc limit ${lim + 1}`, [flowId]);
  const more = rows.length > lim; if (more) rows.length = lim;
  if (!rows.length) return <Empty t="Пока ничего не опубликовано." />;
  return (
    <>
    <FadeList className={`${COL} space-y-5 pb-16`}>{rows.map((r) => (
      <NewsCard key={r.id} s={{ kind: r.kind ?? "manual", title: r.source ?? "Источник удалён", ref: r.ref ?? "", config: r.config ?? null }} when={when(r.updated_at)}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`chip ${r.pub?.includes("failed") || r.status === "failed" ? "!bg-bad-soft !text-bad" : r.pub?.includes("queued") ? "!bg-surface" : "!bg-good-soft !text-good"}`}>{r.pub?.includes("failed") ? "ошибка" : r.pub === "published" ? "опубликовано" : r.pub ? "в очереди" : "не поставлено"}</span>
          {r.urls?.split(" ").map((u) => <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-ink">открыть<ExternalLink size={11} /></a>)}
        </div>
        <PostText title="" text={r.text ?? ""} />
        {r.note && <p className="mt-2 text-xs text-warn">{r.note}</p>}
      </NewsCard>))}</FadeList>
    {more && <div className="mt-2 flex justify-center pb-10"><Link href={`/app/flows/${flowId}?t=queued&n=${lim + 15}`} scroll={false} className="pill">Показать ещё</Link></div>}
    </>
  );
}

async function Rejected({ flowId, write, hid, unlimited, lim }: { flowId: string; write: boolean; hid: Hid; unlimited: boolean; lim: number }) {
  const rows = await q<Src & { id: string; code: string; note: string | null; created_at: string; title: string; body: string; url: string }>(
    `select i.id,i.reject_code code,i.reject_note note,i.created_at,k.title,k.body,k.url,${SRC} from kz_flow_items i join kz_feed_items k on k.id=i.feed_item_id join kz_sources s on s.id=k.source_id
      where i.flow_id=$1 and i.status='rejected' order by i.created_at desc limit ${lim + 1}`, [flowId]);
  const by = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.code]: (a[r.code] ?? 0) + 1 }), {});
  const more = rows.length > lim; if (more) rows.length = lim;
  if (!rows.length) return <Empty t="Отбракованных новостей нет." />;
  return (
    <>
      <div className={`${COL} mb-5 flex flex-wrap justify-center gap-2`}>{Object.entries(by).map(([k, n]) => <span key={k} className="chip">{REJECT[k] ?? k}: {n}</span>)}</div>
      <FadeList className={`${COL} space-y-5 pb-16`}>{rows.map((r) => (
        <NewsCard key={r.id} s={srcOf(r)} when={when(r.created_at)}
          actions={<>
            {write && <form action={rescueFlowItemAction}>{hid(r.id)}<SubmitButton className="h-8 rounded-full bg-surface px-3 text-xs font-medium hover:bg-tile2" title="Пересказать и вернуть в очередь на одобрение">Это нам надо{unlimited ? "" : ` · ${rub(PRICES.flowRewrite)}`}</SubmitButton></form>}
            {r.url.startsWith("http") && <a href={r.url} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-xs font-medium hover:bg-tile2">Открыть<ExternalLink size={12} /></a>}
          </>}>
          <p className="mb-2"><span className="chip !bg-warn-soft !text-warn">{REJECT[r.code] ?? r.code}</span>{r.note && <span className="ml-2 text-xs text-ink2">{r.note}</span>}</p>
          <PostText title="" text={r.body && r.body.length >= r.title.length ? r.body : r.title} />
        </NewsCard>))}</FadeList>
    {more && <div className="mt-2 flex justify-center pb-10"><Link href={`/app/flows/${flowId}?t=rejected&n=${lim + 15}`} scroll={false} className="pill">Показать ещё</Link></div>}
    </>
  );
}

async function Cost({ flowId }: { flowId: string }) {
  const r = await q<{ d: string; n: string; kop: string }>("select to_char(created_at at time zone 'Europe/Moscow','DD.MM') d,count(*) n,sum(cost_kop) kop from kz_flow_items where flow_id=$1 and created_at > now() - interval '30 days' group by 1, date_trunc('day', created_at) order by date_trunc('day', created_at) desc", [flowId]);
  const tot = await one<{ n: string; kop: string; w: string }>("select count(*) n,coalesce(sum(cost_kop),0) kop,coalesce(sum(cost_kop) filter (where created_at > now() - interval '7 days'),0) w from kz_flow_items where flow_id=$1 and created_at > now() - interval '30 days'", [flowId]);
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">{[["Новостей за 30 дней", String(tot!.n)], ["Потрачено за 7 дней", rub(Number(tot!.w))], ["Потрачено за 30 дней", rub(Number(tot!.kop))]].map(([l, v]) => <div key={l} className="rounded-2xl bg-tile p-4"><div className="text-xs text-ink2">{l}</div><div className="mt-1 text-xl font-semibold">{v}</div></div>)}</div>
      <p className="mb-3 text-xs text-ink3">Разбор новости {rub(PRICES.flowClassify)}, пересказ {rub(PRICES.flowRewrite)}, проверка пограничного дубля {rub(PRICES.flowJudge)}; картинка нейросетью по цене картинки. Отбракованное без нейросети (дубли по тексту, реклама по пометкам, стоп-слова) бесплатно. Для администратора платформы всё бесплатно.</p>
      <div className="card"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-ink3"><th className="px-4 py-2 font-normal">День</th><th className="px-4 py-2 text-right font-normal">Новостей</th><th className="px-4 py-2 text-right font-normal">Расход</th></tr></thead>
        <tbody>{r.map((x) => <tr key={x.d} className="border-b border-line last:border-0"><td className="px-4 py-2">{x.d}</td><td className="px-4 py-2 text-right">{x.n}</td><td className="px-4 py-2 text-right">{rub(Number(x.kop))}</td></tr>)}</tbody></table></div>
    </>
  );
}

async function Settings({ flowId, name, st, sourceIds, channelIds, orgId, write }: { flowId: string; name: string; st: ReturnType<typeof cleanFlowSettings>; sourceIds: string[]; channelIds: string[]; orgId: string; write: boolean }) {
  const [sources, channels] = await Promise.all([
    q<{ id: string; title: string; kind: Kind }>("select id,title,kind from kz_sources where org_id=$1 and kind<>'manual' order by created_at", [orgId]),
    q<{ id: string; title: string; kind: string }>("select id,title,kind from kz_channels where org_id=$1 and status='active' and kind<>'wordpress' order by created_at", [orgId]),
  ]);
  const chip = "chip cursor-pointer !px-3 !py-1.5 chip-toggle";
  return (
    <form action={saveFlowSettingsAction} className="space-y-4 pb-16">
      <input type="hidden" name="id" value={flowId} />
      <fieldset disabled={!write} className="space-y-4">
        <Sec title="Основное">
          <div><label className="label">Название потока</label><input name="name" defaultValue={name} maxLength={80} className="input" /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3"><label className="label">Режим</label><select name="mode" defaultValue={st.mode} className="input"><option value="approve">Сначала на одобрение (рекомендуем)</option><option value="auto">Публиковать автоматически</option></select></div>
            <div className="sm:col-span-2"><label className="label">Брать новости не старше, часов</label><input name="maxAgeHours" type="number" min={1} max={168} defaultValue={st.maxAgeHours} className="input" /></div>
            <div><label className="label">Мин. «нашесть», 0–10</label><input name="minFit" type="number" min={0} max={10} defaultValue={st.minFit} className="input" /></div>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="dedupe" defaultChecked={st.dedupe} className="mt-1" />Не публиковать дубли (одно событие из разных источников берём один раз)</label>
        </Sec>

        <Sec title="Откуда берём и куда публикуем">
          <div><span className="label">Откуда берём</span><div className="max-h-72 space-y-0.5 overflow-y-auto rounded-2xl bg-tile p-2">{sources.map((s) => <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-surface"><input type="checkbox" name="sources" value={s.id} defaultChecked={sourceIds.includes(s.id)} /><span className="chip shrink-0">{KIND_LABEL[s.kind]}</span><span className="min-w-0 flex-1 truncate">{s.title}</span></label>)}</div></div>
          <div><span className="label">Куда публикуем</span><div className="space-y-0.5 rounded-2xl bg-tile p-2">{channels.map((s) => <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-surface"><input type="checkbox" name="channels" value={s.id} defaultChecked={channelIds.includes(s.id)} /><span className="chip shrink-0">{SUPPORTED_CHANNELS[s.kind] ?? s.kind}</span><span className="min-w-0 flex-1 truncate">{s.title}</span></label>)}</div></div>
        </Sec>

        <Sec title="Что отбираем">
          <div><span className="label">Какие типы берём</span><div className="flex flex-wrap gap-2">{["news", "announcement", "joke"].map((k) => <label key={k} className={chip}><input type="checkbox" name="types" value={k} defaultChecked={st.types.includes(k)} className="hidden" />{TYPES[k]}</label>)}</div><p className="mt-1 text-xs text-ink3">Реклама и мусор отсеиваются всегда.</p></div>
          <div><span className="label">Темы (пусто — любые)</span><div className="flex flex-wrap gap-2">{TOPICS.map((k) => <label key={k} className={chip}><input type="checkbox" name="topics" value={k} defaultChecked={st.topics.includes(k)} className="hidden" />{k}</label>)}</div></div>
          <div><span className="label">Масштаб (пусто — любой)</span><div className="flex flex-wrap gap-2">{Object.entries(SCOPES).map(([k, v]) => <label key={k} className={chip}><input type="checkbox" name="scopes" value={k} defaultChecked={st.scopes.includes(k)} className="hidden" />{v}</label>)}</div></div>
          <div><label className="label">Регион или город (через запятую, пусто — любой)</label><input name="geo" defaultValue={st.geo} className="input" placeholder="Смоленск, Смоленская область" /><p className="mt-1 text-xs text-ink3">Локальные и региональные новости других мест отсекаются. Федеральные и мировые проходят по фильтру масштаба.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Брать только со словами (через запятую)</label><input name="include" defaultValue={st.include.join(", ")} className="input" /></div>
          <div><label className="label">Стоп-слова: такие новости режем</label><input name="exclude" defaultValue={st.exclude.join(", ")} className="input" /></div></div>
        </Sec>

        <Sec title="Как пишем">
          <div><label className="label">Голос канала</label><textarea name="tone" defaultValue={st.tone} rows={2} maxLength={600} className="input text-sm" placeholder="Например: ироничный, разговорный, короткие абзацы, без канцелярита" /></div>
          <div><label className="label">Примеры ваших лучших постов</label><textarea name="examples" defaultValue={st.examples} rows={5} maxLength={3000} className="input text-sm" placeholder="Вставьте 2–3 поста, на которые нужно быть похожими" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Картинки</label><select name="images" defaultValue={st.images} className="input"><option value="none">Без картинок</option><option value="own">Своя картинка нейросетью (по цене картинки)</option><option value="original">Картинка из источника (риск по правам)</option></select></div>
          <div><label className="label">Ссылка на источник в посте</label><select name="source" defaultValue={st.source} className="input"><option value="none">Не добавлять</option><option value="link">Добавлять «Источник: ссылка»</option></select></div></div>
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">Пересказ нейросетью не снимает авторские права автоматически: факты свободны, а тексты, фото и видео защищены. Берите источники, которые разрешают перепечатку, или свои каналы. Картинки из источников используйте только с разрешения владельца. Ответственность за публикацию лежит на владельце потока.</p>
        </Sec>

        <Sec title="Расписание">
          <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Не больше постов в день</label><input name="dailyCap" type="number" min={1} max={200} defaultValue={st.dailyCap} className="input" /></div>
          <div><label className="label">Пауза между постами, мин</label><input name="minGapMin" type="number" min={0} max={720} defaultValue={st.minGapMin} className="input" /></div>
          <div><label className="label">Тихие часы с (МСК)</label><input name="quietFrom" type="number" min={0} max={23} defaultValue={st.quietFrom} className="input" /></div>
          <div><label className="label">до (МСК)</label><input name="quietTo" type="number" min={0} max={23} defaultValue={st.quietTo} className="input" /></div></div>
          <p className="text-xs text-ink3">Лимит, паузы и тихие часы применяются в автоматическом режиме. При ручном одобрении вы сами решаете, когда публиковать.</p>
        </Sec>
        {write && <div className="flex justify-center"><SubmitButton className="btn">Сохранить настройки</SubmitButton></div>}
      </fieldset>
    </form>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card mx-auto w-full max-w-[680px] space-y-4 p-5"><h2 className="text-base font-semibold">{title}</h2>{children}</section>;
}
