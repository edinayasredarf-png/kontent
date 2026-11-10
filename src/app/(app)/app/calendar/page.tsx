import { canWrite, requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { KINDS } from "@/lib/plan";
import { CalendarGrid } from "@/components/CalendarGrid";
import { KIND, STATUS } from "@/components/ui";
import { ItemModal } from "@/components/ItemModal";
import { CalendarFilters } from "@/components/CalendarFilters";

import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { ModalButton } from "@/components/ui/ModalButton";
import { addCalendarIdea, extendCalendarPlan } from "@/lib/calendar-actions";
import { PRICES, tokens as rub } from "@/lib/wallet";
import { SubmitButton } from "@/components/SubmitButton";
import { calendarRange, calendarHref, moscowToday, PERIODS, shiftPeriod, validDay, type CalendarPeriod } from "@/lib/calendar";
const MOVABLE = ["idea", "approved", "ready", "failed", "rejected"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const c = await requireCtx();
  const period: CalendarPeriod = sp.period && Object.hasOwn(PERIODS, sp.period) ? sp.period as CalendarPeriod : "month";
  const date = validDay(sp.date ?? "") ? sp.date! : /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") && validDay(`${sp.m}-01`) ? `${sp.m}-01` : moscowToday();
  const month = date.slice(0, 7);
  const { from, to } = calendarRange(period, date);
  const factories = await q<{ id: string; name: string }>("select id,name from kz_factories where org_id=$1 order by name", [c.org.id]);
  const args: unknown[] = [c.org.id, from, to];
  const cond: string[] = [];
  const f = factories.some((x) => x.id === sp.factory) ? sp.factory : "";
  if (f) { args.push(f); cond.push(`i.factory_id=$${args.length}`); }
  if (KINDS.includes(sp.kind as never)) { args.push(sp.kind); cond.push(`i.kind=$${args.length}`); }
  if (sp.status && STATUS[sp.status]) { args.push(sp.status); cond.push(`i.status=$${args.length}`); }
  const rows = await q<{ id: string; date: string; kind: string; topic: string; status: string; factory_id: string; factory: string; color: string | null; time: string | null }>(
    `select i.id,to_char(i.planned_for,'YYYY-MM-DD') date,i.kind,i.topic,i.status,i.factory_id,f.name factory,i.meta->>'calendarColor' color,
            to_char((i.meta->>'publishAt')::timestamptz at time zone coalesce(f.schedule->>'tz','Europe/Moscow'),'HH24:MI') time
       from kz_content_items i left join kz_factories f on f.id=i.factory_id
      where i.org_id=$1 and not coalesce((i.meta->>'draft')::boolean,false) and i.planned_for between $2 and $3 ${cond.map((x) => "and " + x).join(" ")} order by i.planned_for, i.created_at`, args);
  const qs = (o: Record<string, string>) => { const u = new URLSearchParams(); const { item: _i, err: _e, note: _n, ...keep } = sp; void _i; void _e; void _n; for (const [k, v] of Object.entries({ ...keep, ...o })) if (v) u.set(k, v); return `/app/calendar?${u}`; };
  const itemId = /^[0-9a-f-]{36}$/.test(sp.item ?? "") ? sp.item! : "";
  const view = sp.view === "list" ? "list" : "calendar";
  const returnFields = ["m", "date", "period", "view", "factory", "kind", "status"].map((key) => <input key={key} type="hidden" name={`return_${key}`} value={key === "m" ? month : key === "date" ? date : key === "period" ? period : sp[key] ?? ""} />);
  const factorySelect = <label className="block space-y-2"><span className="text-sm text-ink2">Завод</span><select name="factory" defaultValue={f || factories[0]?.id} required className="input">{factories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-medium leading-8">Контент план</h1>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarFilters month={month} date={date} period={period} factory={f ?? ""} kind={sp.kind ?? ""} status={sp.status ?? ""} view={view}
            factories={factories.map((x) => ({ value: x.id, label: x.name }))} kinds={KINDS.map((k) => ({ value: k, label: KIND[k] }))} statuses={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
          {canWrite(c.org.role) && <>
            <ModalButton label="Добавить идею" title="Добавить идею" className="btn btn-ghost !rounded-lg" stamp={Date.now()}>
              {factories.length ? <form action={addCalendarIdea} className="space-y-4">
                {returnFields}{factorySelect}
                <label className="block space-y-2"><span className="text-sm text-ink2">Тема материала</span><input name="topic" required minLength={3} maxLength={300} className="input" /></label>
                <label className="block space-y-2"><span className="text-sm text-ink2">Хук (необязательно)</span><input name="hook" maxLength={300} className="input" /></label>
                <label className="block space-y-2"><span className="text-sm text-ink2">Формат</span><select name="kind" defaultValue={sp.kind || "post"} className="input">{KINDS.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></label>
                <label className="block space-y-2"><span className="text-sm text-ink2">Дата</span><input name="date" type="date" className="input" /></label>
                <p className="text-xs text-ink3">Если дату не выбрать, идея займёт ближайший свободный день в плане завода.</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="approve" />Сразу одобрить</label>
                <SubmitButton className="btn btn-accent"><Plus size={16} />Добавить идею</SubmitButton>
              </form> : <p className="text-sm text-ink2">Для добавления идей <Link className="text-accent underline" href="/app/factories/new">создайте завод</Link>.</p>}
            </ModalButton>
            <ModalButton label="Продлить план" title="Продлить план" icon={<Sparkles size={16} />} className="btn btn-accent !rounded-lg" stamp={Date.now()}>
              {factories.length ? <form action={extendCalendarPlan} className="space-y-4">
                {returnFields}{factorySelect}
                <p className="text-sm text-ink2">Новые темы дополнят план выбранного завода без повторов существующих тем.</p>
                <label className="block space-y-2"><span className="text-sm text-ink2">Период и стоимость</span><select name="days" defaultValue="7" className="input">{[7, 14, 30].map((d) => <option key={d} value={d}>{d} дней · {c.org.unlimited ? "бесплатно для админа" : rub(d * PRICES.plan_day)}</option>)}</select></label>
                <SubmitButton className="btn btn-accent"><Sparkles size={16} />Продлить план</SubmitButton>
              </form> : <p className="text-sm text-ink2">Для продления плана <Link className="text-accent underline" href="/app/factories/new">создайте завод</Link>.</p>}
            </ModalButton>
          </>}
        </div>
      </div>
      {sp.err && !itemId && <p role="alert" className="mb-4 rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{sp.err}</p>}
      {itemId && <ItemModal orgId={c.org.id} id={itemId} returnTo={qs({})} err={sp.err} note={sp.note} canWrite={canWrite(c.org.role)} />}
      <CalendarGrid key={`${date}|${period}|${view}|${f ?? ""}|${sp.kind ?? ""}|${sp.status ?? ""}`} month={month} date={date} period={period} view={view} baseHref={qs({})}
        prevHref={calendarHref(qs({}), { date: shiftPeriod(period, date, -1), m: shiftPeriod(period, date, -1).slice(0, 7) })}
        nextHref={calendarHref(qs({}), { date: shiftPeriod(period, date, 1), m: shiftPeriod(period, date, 1).slice(0, 7) })}
        items={rows.map((r) => ({ id: r.id, date: r.date, time: r.time, color: r.color, kind: r.kind, topic: r.topic, status: r.status, label: r.factory || "Без завода", href: qs({ item: r.id }), movable: canWrite(c.org.role) && MOVABLE.includes(r.status) }))} />
    </>
  );
}
