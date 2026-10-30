import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, RefreshCw, Send, Trash2, Users } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { competitorStats, groupPosts, KIND_NAME, MAX_PLATFORMS, type CKind } from "@/lib/competitors";
import { addPlatformAction, competitorToPlanAction, deleteCompetitorAction, deletePlatformAction, refreshCompetitorAction } from "@/lib/competitors-actions";
import { bounds, parseRange, uuidOrEmpty, type Preset } from "@/lib/range";
import { Form } from "@/components/Form";
import { FilterBar } from "@/components/FilterBar";
import { PlatformPicker } from "@/components/PlatformPicker";
import { PageHead } from "@/components/ui";
import { ModalButton } from "@/components/ui/ModalButton";
import { PostCard, RoundIcon } from "@/components/ui/PostCard";
import { PostText } from "@/components/monitor/PostText";
import { SubmitButton } from "@/components/SubmitButton";

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("ru-RU"));
const ICON: Record<CKind, typeof Send> = { telegram: Send, vk: Users, site: Globe };
const PRESETS: [Preset, string][] = [["7", "7 дней"], ["30", "30 дней"], ["all", "Всё время"]];

export default async function Competitor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ r?: string; from?: string; to?: string; platform?: string; sort?: string; q?: string; n?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await requireCtx();
  const write = canWrite(c.org.role);
  const g = await one<{ id: string; name: string }>("select id,name from kz_competitor_groups where id=$1 and org_id=$2", [id, c.org.id]);
  if (!g) notFound();
  const [all, factories] = await Promise.all([
    competitorStats(c.org.id),
    q<{ id: string; name: string }>("select id,name from kz_factories where org_id=$1 order by name", [c.org.id]),
  ]);
  const platforms = all.filter((s) => s.group_id === id);
  const rg = parseRange(sp, [...PRESETS.map(([k]) => k), "custom"], "30");
  const platform = platforms.some((p) => p.id === uuidOrEmpty(sp.platform)) ? sp.platform! : "";
  const sort = sp.sort === "views" ? "views" : "date";
  const text = (sp.q ?? "").trim().slice(0, 80);
  const lim = Math.min(300, Math.max(20, Math.round(Number(sp.n)) || 20));
  const bd = bounds(rg);
  const { rows, more } = await groupPosts(c.org.id, id, { platform, from: bd.from, to: bd.to, sort, q: text, limit: lim });
  const filtered = !!(platform || text || rg.r !== "30" || sort !== "date");
  const more_href = (() => { const u = new URLSearchParams(); if (rg.r !== "30") u.set("r", rg.r); if (rg.r === "custom") { if (rg.from) u.set("from", rg.from); if (rg.to) u.set("to", rg.to); } if (platform) u.set("platform", platform); if (sort !== "date") u.set("sort", sort); if (text) u.set("q", text); u.set("n", String(lim + 20)); return `/app/competitors/${id}?${u}`; })();
  return (
    <>
      <Link href="/app/competitors" className="mb-1 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Все конкуренты</Link>
      <PageHead title={g.name} sub={`Площадок: ${platforms.length}. Данные обновляются дважды в сутки.`} />
      {write && (
        <div className="-mt-3 mb-6 flex flex-wrap items-center justify-start gap-2">
          {platforms.length < MAX_PLATFORMS && (
            <ModalButton label="Добавить площадку" title="Добавить площадку конкурента" className="pill pill-on">
              <Form action={addPlatformAction} submit="Добавить">
                <input type="hidden" name="group" value={id} />
                <PlatformPicker />
                <p className="text-xs text-ink3">Только открытые источники, не больше {MAX_PLATFORMS} площадок на конкурента.</p>
              </Form>
            </ModalButton>
          )}
          <form action={refreshCompetitorAction}><input type="hidden" name="group" value={id} /><SubmitButton className="pill"><RefreshCw size={15} />Обновить всё</SubmitButton></form>
          <form action={deleteCompetitorAction}><input type="hidden" name="id" value={id} /><SubmitButton data-confirm={`Удалить конкурента «${g.name}» вместе со всеми площадками и постами?`} className="grid size-10 place-items-center rounded-full bg-bad-soft text-bad transition hover:opacity-80" title="Удалить конкурента" aria-label="Удалить конкурента"><Trash2 size={15} /></SubmitButton></form>
        </div>
      )}

      <div className="w-full max-w-[680px] space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold">Площадки</h2>
          <div className="space-y-3">
            {platforms.map((s) => { const I = ICON[s.kind]; const site = s.kind === "site"; return (
              <div key={s.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <RoundIcon><I size={16} /></RoundIcon>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{s.title}</div><div className="truncate text-xs text-ink3">{KIND_NAME[s.kind]} · {s.ref.replace(/^https?:\/\//, "")}</div></div>
                  {write && <div className="flex gap-1.5">
                    <form action={refreshCompetitorAction}><input type="hidden" name="id" value={s.id} /><SubmitButton className="text-ink3 hover:text-ink" title="Обновить"><RefreshCw size={15} /></SubmitButton></form>
                    <form action={deletePlatformAction}><input type="hidden" name="id" value={s.id} /><SubmitButton data-confirm="Убрать площадку вместе с её постами?" className="text-ink3 hover:text-bad" title="Убрать площадку"><Trash2 size={15} /></SubmitButton></form></div>}
                </div>
                {s.last_error && <p className="mt-2 rounded-lg bg-bad-soft px-2 py-1 text-xs text-bad">{s.last_error}</p>}
                <dl className={`mt-3 grid gap-2 text-center ${site ? "grid-cols-2" : "grid-cols-3"}`}>
                  {(site ? [["Материалов за 30 дней", String(s.posts30)], ["Материалов в неделю", String(s.perWeek)]] : [["Подписчики", fmt(s.members)], ["Постов в неделю", String(s.perWeek)], ["Просмотров на пост", fmt(s.avgViews)]]).map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-tile px-2 py-2"><dd className="text-base font-semibold">{v}</dd><dt className="text-[11px] text-ink2">{l}</dt></div>))}
                </dl>
                <p className="mt-2 text-center text-xs text-ink2">{s.erPct != null && <>Охват поста ≈ {s.erPct}% подписчиков. </>}{s.bestHour != null && <>Лучше всего заходят публикации около {s.bestHour}:00 МСК.</>}</p>
              </div>); })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-center text-sm font-semibold">Посты и новости</h2>
          <FilterBar path={`/app/competitors/${id}`} presets={PRESETS} r={rg.r} from={rg.from} to={rg.to}
            search={{ name: "q", value: text, placeholder: "Поиск по тексту" }}
            selects={[
              { name: "platform", label: "Площадка", all: "Все площадки", value: platform, options: platforms.map((p) => ({ value: p.id, label: `${KIND_NAME[p.kind]}: ${p.title}` })) },
              { name: "sort", label: "Порядок", all: "Сначала новые", value: sort === "views" ? "views" : "", options: [{ value: "views", label: "Сначала самые просматриваемые" }] },
            ]} />
          {rows.length === 0 && <p className="rounded-3xl bg-tile px-5 py-6 text-center text-sm text-ink2">{filtered ? "По этим фильтрам ничего нет. Измените период или сбросьте фильтры." : "Постов пока нет."}</p>}
          <div className="space-y-3">
            {rows.map((t) => (
              <PostCard key={t.id} icon={<RoundIcon>{(() => { const I = ICON[t.kind as CKind]; return <I size={16} />; })()}</RoundIcon>} title={t.comp} sub={t.kind === "site" ? "сайт · открыть ↗" : `${fmt(t.views)} просмотров · открыть ↗`} subHref={t.url}
                when={new Date(t.at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                actions={write && factories.length > 0 ? (
                  <Form action={competitorToPlanAction} submit="В план" variant="ghost" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="post" value={t.id} />
                    <select name="factory" className="input !w-auto !py-1 text-xs">{factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                  </Form>
                ) : undefined}>
                <PostText title="" text={t.body} />
              </PostCard>
            ))}
          </div>
          {more && <div className="mt-4 flex justify-center"><Link href={more_href} scroll={false} className="pill">Показать ещё</Link></div>}
          {rows.length > 0 && <p className="mt-3 text-center text-xs text-ink3">«В план» создаёт идею, которую сервис напишет своими словами с позиции вашего бренда, без копирования.</p>}
        </section>
      </div>
    </>
  );
}
