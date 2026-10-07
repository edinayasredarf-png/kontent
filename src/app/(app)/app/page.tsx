import Link from "next/link";
import { Factory, Building2, FileText, CheckCircle2, ArrowRight } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { PLANS, fmtLimit } from "@/lib/plans";
import { PageHead, Status, KIND } from "@/components/ui";

export default async function Overview() {
  const c = await requireCtx();
  const cnt = await one<{ b: string; f: string; r: string; p: string }>(
    `select (select count(*) from brands where org_id=$1) b, (select count(*) from factories where org_id=$1) f,
            (select count(*) from content_items where org_id=$1 and status in ('idea','ready')) r,
            (select count(*) from content_items where org_id=$1 and status='published') p`, [c.org.id]);
  const recent = await q<{ id: string; topic: string; kind: string; status: string; brand: string; factory_id: string }>(
    `select i.id,i.topic,i.kind,i.status,b.name brand,i.factory_id from content_items i join brands b on b.id=i.brand_id
      where i.org_id=$1 order by i.created_at desc limit 8`, [c.org.id]);
  const plan = c.org.unlimited ? { brands: null, factories: null } : PLANS[c.org.plan];
  const tiles = [
    { l: "Бренды", v: `${cnt!.b} / ${fmtLimit(plan.brands)}`, i: Building2 },
    { l: "Заводы", v: `${cnt!.f} / ${fmtLimit(plan.factories)}`, i: Factory },
    { l: "Ждут решения", v: cnt!.r, i: FileText },
    { l: "Опубликовано", v: cnt!.p, i: CheckCircle2 },
  ];
  return (
    <>
      <PageHead title={`Здравствуйте, ${c.user.name || "коллега"}`} sub={c.org.name} action={<Link href="/app/factories/new" className="btn btn-accent">Создать завод</Link>} />
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ l, v, i: I }) => (
          <div key={l} className="rounded-2xl bg-tile p-5"><div className="mb-2 flex items-center gap-2 text-sm text-ink2"><I size={16} />{l}</div><div className="text-2xl font-semibold">{v}</div></div>
        ))}
      </div>
      <div className="card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3"><b className="text-sm">Последние материалы</b><Link className="flex items-center gap-1 text-xs text-accent-ink" href="/app/factories">Все заводы <ArrowRight size={13} /></Link></div>
        {recent.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink2">Пока пусто. Создайте бренд и первый завод — план сгенерируется за минуту.</p>}
        {recent.map((r) => (
          <Link key={r.id} href={`/app/factories/${r.factory_id}`} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0 hover:bg-tile/50">
            <span className="chip">{KIND[r.kind]}</span><span className="min-w-0 flex-1 truncate text-sm">{r.topic}</span><span className="hidden text-xs text-ink3 sm:block">{r.brand}</span><Status s={r.status} />
          </Link>
        ))}
      </div>
    </>
  );
}
