import { canWrite, requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { KINDS } from "@/lib/plan";
import { CalendarGrid } from "@/components/CalendarGrid";
import { KIND, PageHead, STATUS } from "@/components/ui";

const MOVABLE = ["idea", "approved", "ready", "failed", "rejected"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const c = await requireCtx();
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : new Date().toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  // сетка показывает хвосты соседних месяцев — берём с запасом в неделю с каждой стороны
  const from = new Date(y, m - 1, -6).toISOString().slice(0, 10), to = new Date(y, m, 8).toISOString().slice(0, 10);
  const factories = await q<{ id: string; name: string }>("select id,name from kz_factories where org_id=$1 order by name", [c.org.id]);
  const args: unknown[] = [c.org.id, from, to];
  const cond: string[] = [];
  const f = factories.some((x) => x.id === sp.factory) ? sp.factory : "";
  if (f) { args.push(f); cond.push(`i.factory_id=$${args.length}`); }
  if (KINDS.includes(sp.kind as never)) { args.push(sp.kind); cond.push(`i.kind=$${args.length}`); }
  if (sp.status && STATUS[sp.status]) { args.push(sp.status); cond.push(`i.status=$${args.length}`); }
  const rows = await q<{ id: string; date: string; kind: string; topic: string; status: string; factory_id: string; factory: string }>(
    `select i.id,to_char(i.planned_for,'YYYY-MM-DD') date,i.kind,i.topic,i.status,i.factory_id,f.name factory
       from kz_content_items i join kz_factories f on f.id=i.factory_id
      where i.org_id=$1 and i.planned_for between $2 and $3 ${cond.map((x) => "and " + x).join(" ")} order by i.planned_for, i.created_at limit 1500`, args);
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const qs = (o: Record<string, string>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, ...o })) if (v) u.set(k, v); return `/app/calendar?${u}`; };
  return (
    <>
      <PageHead title="Календарь" sub="Все материалы по заводам. Перетащите материал на другой день или нажмите на него, чтобы открыть." />
      <form className="card mb-4 flex flex-wrap items-center gap-2 p-3" action="/app/calendar">
        <input type="hidden" name="m" value={month} />
        <select name="factory" defaultValue={f} className="input !w-auto"><option value="">Все заводы</option>{factories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select name="kind" defaultValue={sp.kind ?? ""} className="input !w-auto"><option value="">Все форматы</option>{KINDS.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input !w-auto"><option value="">Все статусы</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <button className="btn btn-ghost ml-auto">Применить</button>
      </form>
      <CalendarGrid month={month} prevHref={qs({ m: shift(-1) })} nextHref={qs({ m: shift(1) })}
        items={rows.map((r) => ({ id: r.id, date: r.date, kind: r.kind, topic: r.topic, status: r.status, label: r.factory, href: `/app/factories/${r.factory_id}?view=list&open=${r.id}#i-${r.id}`, movable: canWrite(c.org.role) && MOVABLE.includes(r.status) }))} />
    </>
  );
}
