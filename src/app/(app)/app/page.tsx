import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Circle, Eye, Flame, Send, Sparkles, Wallet2 } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { PLANS, fmtLimit } from "@/lib/plans";
import { rub } from "@/lib/wallet";
import { KIND, PageHead, Status } from "@/components/ui";

export default async function Overview({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const days = d === "30" ? 30 : d === "all" ? 0 : 7;
  const c = await requireCtx();
  const o = c.org.id;
  const since = days ? `now() - interval '${days} days'` : "'1970-01-01'::timestamptz";

  const [k, byKind, recent, setup, fire] = await Promise.all([
    one<{ produced: string; published: string; spent: string; reach: string; likes: string; brands: string; factories: string }>(
      `select (select count(*) from kz_content_items where org_id=$1 and status in ('ready','scheduled','published') and updated_at >= ${since}) produced,
              (select count(*) from kz_publications where org_id=$1 and status='published' and published_at >= ${since}) published,
              (select coalesce(sum(case when amount_kop<0 then -amount_kop when reason like 'Возврат:%' then -amount_kop else 0 end),0) from kz_wallet_tx where org_id=$1 and created_at >= ${since}) spent,
              (select coalesce(sum(s.views),0) from kz_post_stats s join kz_publications p on p.id=s.publication_id where s.org_id=$1 and p.published_at >= ${since}) reach,
              (select coalesce(sum(s.likes),0) from kz_post_stats s join kz_publications p on p.id=s.publication_id where s.org_id=$1 and p.published_at >= ${since}) likes,
              (select count(*) from kz_brands where org_id=$1) brands, (select count(*) from kz_factories where org_id=$1) factories`, [o]),
    q<{ kind: string; n: string }>(`select kind,count(*) n from kz_content_items where org_id=$1 and status in ('ready','scheduled','published') and updated_at >= ${since} group by kind order by n desc`, [o]),
    q<{ id: string; topic: string; kind: string; status: string; brand: string; factory_id: string }>(
      `select i.id,i.topic,i.kind,i.status,b.name brand,i.factory_id from kz_content_items i join kz_brands b on b.id=i.brand_id where i.org_id=$1 order by i.created_at desc limit 6`, [o]),
    one<{ brand_ok: boolean; channel: boolean; factory: boolean; made: boolean; published: boolean }>(
      `select exists(select 1 from kz_brands where org_id=$1 and description<>'') brand_ok, exists(select 1 from kz_channels where org_id=$1) channel,
              exists(select 1 from kz_factories where org_id=$1) factory, exists(select 1 from kz_content_items where org_id=$1 and status in ('ready','scheduled','published')) made,
              exists(select 1 from kz_publications where org_id=$1 and status='published') published`, [o]),
    one<{ ideas: string; due: string; failed_pub: string; failed_items: string; bad_sources: string; short_plan: string; short_name: string | null; comments: string }>(
      `select (select count(*) from kz_content_items i join kz_factories f on f.id=i.factory_id where i.org_id=$1 and i.status='idea' and f.approval='manual') ideas,
              (select count(*) from kz_content_items where org_id=$1 and status='approved' and planned_for <= current_date) due,
              (select count(*) from kz_publications where org_id=$1 and status='failed' and updated_at > now() - interval '7 days') failed_pub,
              (select count(*) from kz_content_items where org_id=$1 and status='failed') failed_items,
              (select count(*) from kz_sources where org_id=$1 and status='active' and last_error is not null) bad_sources,
              (select count(*) from kz_factories f where f.org_id=$1 and f.status='active' and coalesce((select max(planned_for) from kz_content_items i where i.factory_id=f.id and i.status in ('idea','approved','ready','scheduled')), current_date - 1) < current_date + 3) short_plan,
              (select f.name from kz_factories f where f.org_id=$1 and f.status='active' and coalesce((select max(planned_for) from kz_content_items i where i.factory_id=f.id and i.status in ('idea','approved','ready','scheduled')), current_date - 1) < current_date + 3 order by f.created_at limit 1) short_name,
              (select count(*) from kz_comments where org_id=$1 and status='new') comments`, [o]),
  ]);

  const plan = c.org.unlimited ? { brands: null, factories: null } : PLANS[c.org.plan];
  const alerts: { text: string; href: string; tone: "bad" | "warn" }[] = [];
  const n = (v: string | null | undefined) => Number(v ?? 0);
  if (n(fire?.failed_pub)) alerts.push({ text: `Ошибки публикации за неделю: ${fire!.failed_pub}`, href: "/app/publications", tone: "bad" });
  if (n(fire?.failed_items)) alerts.push({ text: `Материалы с ошибкой генерации: ${fire!.failed_items}`, href: "/app/factories", tone: "bad" });
  if (!c.org.unlimited && c.org.balance_kop < 10000 && c.org.role !== "viewer") alerts.push({ text: `Мало денег на балансе: ${rub(c.org.balance_kop)}`, href: "/app/billing", tone: "warn" });
  if (n(fire?.due)) alerts.push({ text: `Одобрено, но не написано, срок настал: ${fire!.due}`, href: "/app/factories", tone: "warn" });
  if (n(fire?.ideas)) alerts.push({ text: `Идеи ждут вашего одобрения: ${fire!.ideas}`, href: "/app/factories", tone: "warn" });
  if (n(fire?.short_plan)) alerts.push({ text: `План скоро закончится${fire!.short_name ? `: «${fire!.short_name}»` : ""}${n(fire!.short_plan) > 1 ? ` и ещё ${n(fire!.short_plan) - 1}` : ""}`, href: "/app/factories", tone: "warn" });
  if (n(fire?.bad_sources)) alerts.push({ text: `Источники мониторинга с ошибкой: ${fire!.bad_sources}`, href: "/app/monitor/settings", tone: "warn" });
  if (n(fire?.comments)) alerts.push({ text: `Новые комментарии без ответа: ${fire!.comments}`, href: "/app/inbox", tone: "warn" });

  const steps = [
    { done: setup!.brand_ok, t: "Заполнить профиль бренда", href: "/app/brands" },
    { done: setup!.channel, t: "Подключить канал (Telegram, VK)", href: "/app/channels" },
    { done: setup!.factory, t: "Создать первый завод", href: "/app/factories/new" },
    { done: setup!.made, t: "Получить первый материал", href: "/app/factories" },
    { done: setup!.published, t: "Опубликовать", href: "/app/publications" },
  ];
  const doneN = steps.filter((s) => s.done).length;
  const max = Math.max(1, ...byKind.map((x) => Number(x.n)));
  const periods: [string, string][] = [["7", "7 дней"], ["30", "30 дней"], ["all", "Всё время"]];
  const tiles = [
    { l: "Произведено", v: k!.produced, i: Sparkles, s: `бренды ${k!.brands}/${fmtLimit(plan.brands)} · заводы ${k!.factories}/${fmtLimit(plan.factories)}` },
    { l: "Опубликовано", v: k!.published, i: Send, s: "постов в каналах" },
    { l: "Потрачено", v: c.org.unlimited ? "—" : rub(Number(k!.spent)), i: Wallet2, s: c.org.unlimited ? "для админа бесплатно" : "за вычетом возвратов" },
    { l: "Охват", v: Number(k!.reach).toLocaleString("ru-RU"), i: Eye, s: `реакций: ${Number(k!.likes).toLocaleString("ru-RU")}` },
  ];

  return (
    <>
      <PageHead title={`Здравствуйте, ${c.user.name || "коллега"}`} sub={c.org.name} action={<Link href="/app/factories/new" className="btn btn-accent">Создать завод</Link>} />
      <div className="mb-4 flex gap-1 text-sm">{periods.map(([v, l]) => <Link key={v} href={`/app?d=${v}`} className={`rounded-lg px-3 py-1.5 ${(days === 0 ? "all" : String(days)) === v ? "bg-tile font-medium" : "text-ink2 hover:bg-tile/60"}`}>{l}</Link>)}</div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ l, v, i: I, s }) => (
          <div key={l} className="rounded-2xl bg-tile p-5"><div className="mb-2 flex items-center gap-2 text-sm text-ink2"><I size={16} />{l}</div><div className="text-2xl font-semibold">{v}</div><div className="mt-1 text-xs text-ink3">{s}</div></div>
        ))}
      </div>

      {doneN < steps.length && (
        <section className="card mb-6 p-5">
          <div className="mb-3 flex items-center justify-between"><b className="text-sm">С чего начать</b><span className="text-xs text-ink3">{doneN} из {steps.length}</span></div>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-tile2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneN / steps.length) * 100}%` }} /></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((s) => (
              <Link key={s.t} href={s.href} className={`flex items-start gap-2 rounded-xl p-3 text-sm ${s.done ? "bg-good-soft text-good" : "bg-tile hover:bg-tile2"}`}>
                {s.done ? <Check size={16} className="mt-0.5 shrink-0" /> : <Circle size={16} className="mt-0.5 shrink-0 text-ink3" />}<span className={s.done ? "line-through opacity-70" : ""}>{s.t}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <b className="mb-3 flex items-center gap-2 text-sm"><Flame size={16} className="text-warn" />Что горит</b>
          {alerts.length === 0 ? <p className="rounded-xl bg-good-soft px-4 py-3 text-sm text-good">Всё спокойно: ошибок и просроченных задач нет.</p> : (
            <div className="space-y-2">{alerts.map((a) => (
              <Link key={a.text} href={a.href} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${a.tone === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
                <AlertTriangle size={15} className="shrink-0" /><span className="flex-1">{a.text}</span><ArrowRight size={14} />
              </Link>))}</div>
          )}
        </section>
        <section className="card p-5">
          <b className="mb-3 block text-sm">Произведено по типам</b>
          {byKind.length === 0 ? <p className="text-sm text-ink2">За выбранный период материалов нет.</p> : (
            <div className="space-y-3">{byKind.map((x) => (
              <div key={x.kind}><div className="mb-1 flex justify-between text-sm"><span>{KIND[x.kind] ?? x.kind}</span><b>{x.n}</b></div><div className="h-2 overflow-hidden rounded-full bg-tile2"><div className="h-full rounded-full bg-accent" style={{ width: `${(Number(x.n) / max) * 100}%` }} /></div></div>
            ))}</div>
          )}
        </section>
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3"><b className="text-sm">Последние материалы</b><Link className="flex items-center gap-1 text-xs text-accent-ink" href="/app/factories">Все заводы <ArrowRight size={13} /></Link></div>
        {recent.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink2">Пока пусто. Создайте бренд и первый завод — план сгенерируется за минуту.</p>}
        {recent.map((r) => (
          <Link key={r.id} href={`/app/factories/${r.factory_id}?view=list&open=${r.id}#i-${r.id}`} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0 hover:bg-tile/50">
            <span className="chip">{KIND[r.kind]}</span><span className="min-w-0 flex-1 truncate text-sm">{r.topic}</span><span className="hidden text-xs text-ink3 sm:block">{r.brand}</span><Status s={r.status} />
          </Link>
        ))}
      </div>
    </>
  );
}
