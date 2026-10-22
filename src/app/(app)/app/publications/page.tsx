import Link from "next/link";
import { Send } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PageHead, Empty, Status, KIND, STATUS } from "@/components/ui";
import { PostCard, RoundIcon } from "@/components/ui/PostCard";
import { ItemModal } from "@/components/ItemModal";
import { FilterBar } from "@/components/FilterBar";
import { parseRange, uuidOrEmpty, type Preset } from "@/lib/range";
import { SUPPORTED_CHANNELS } from "@/lib/publishing";

const PRESETS: [Preset, string][] = [["all", "Все даты"], ["yesterday", "Вчера"], ["today", "Сегодня"], ["tomorrow", "Завтра"]];
const STATUSES = ["ready", "scheduled", "published", "failed"];

export default async function Publications({ searchParams }: { searchParams: Promise<{ n?: string; item?: string; err?: string; note?: string; r?: string; from?: string; to?: string; brand?: string; kind?: string; status?: string; channel?: string }> }) {
  const sp = await searchParams;
  const { n, item, err, note } = sp;
  const itemId = /^[0-9a-f-]{36}$/.test(item ?? "") ? item! : "";
  const lim = Math.min(400, Math.max(30, Math.round(Number(n)) || 30));
  const c = await requireCtx();
  const [brands, channels] = await Promise.all([
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by created_at", [c.org.id]),
    q<{ id: string; title: string; kind: string }>("select id,title,kind from kz_channels where org_id=$1 order by created_at", [c.org.id]),
  ]);
  const rg = parseRange({ r: sp.r === "all" ? "all" : sp.r, from: sp.from, to: sp.to }, [...PRESETS.map(([k]) => k), "custom"], "all");
  const brand = brands.some((x) => x.id === uuidOrEmpty(sp.brand)) ? sp.brand! : "", channel = channels.some((x) => x.id === uuidOrEmpty(sp.channel)) ? sp.channel! : "";
  const kind = sp.kind && sp.kind in KIND ? sp.kind : "", status = STATUSES.includes(sp.status ?? "") ? sp.status! : "";
  // дата материала — плановая, а если её нет, то время постановки в очередь или создания (по Москве)
  const D = "coalesce(i.planned_for,(coalesce(i.scheduled_at,i.created_at) at time zone 'Europe/Moscow')::date)";
  const params: unknown[] = [c.org.id]; let where = "";
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (rg.from) where += ` and ${D} >= ${add(rg.from)}::date`;
  if (rg.to) where += ` and ${D} <= ${add(rg.to)}::date`;
  if (brand) where += ` and i.brand_id=${add(brand)}::uuid`;
  if (kind) where += ` and i.kind=${add(kind)}`;
  if (status) where += ` and i.status=${add(status)}`;
  if (channel) where += ` and exists(select 1 from kz_publications p where p.item_id=i.id and p.channel_id=${add(channel)}::uuid)`;
  const rows = await q<{ id: string; topic: string; kind: string; status: string; brand: string; planned_for: string | null }>(
    `select i.id,i.topic,i.kind,i.status,b.name brand,to_char(${D},'YYYY-MM-DD') planned_for from kz_content_items i join kz_brands b on b.id=i.brand_id
      where i.org_id=$1 and not coalesce((i.meta->>'draft')::boolean,false) and i.status = any(${add(status ? [status] : STATUSES)}::text[])${where} order by coalesce(i.scheduled_at,i.created_at) desc limit ${lim + 1}`, params);
  const hasMore = rows.length > lim; if (hasMore) rows.length = lim;
  const filtered = !!(brand || channel || kind || status || rg.r !== "all");
  // адрес с текущими фильтрами: для окна материала и «Показать ещё»
  const base = new URLSearchParams();
  if (rg.r !== "all") base.set("r", rg.r);
  if (rg.r === "custom") { if (rg.from) base.set("from", rg.from); if (rg.to) base.set("to", rg.to); }
  for (const [k, v] of Object.entries({ brand, channel, kind, status })) if (v) base.set(k, v);
  const href = (extra: Record<string, string>) => { const u = new URLSearchParams(base); for (const [k, v] of Object.entries(extra)) u.set(k, v); const t = u.toString(); return `/app/publications${t ? `?${t}` : ""}`; };
  return (
    <>
      {itemId && <ItemModal orgId={c.org.id} id={itemId} returnTo={href(n ? { n: String(lim) } : {})} err={err} note={note} canWrite={canWrite(c.org.role)} />}
      <PageHead title="Публикации" sub="Готовые материалы, очередь и опубликованное." />
      <FilterBar path="/app/publications" presets={PRESETS} r={rg.r} from={rg.from} to={rg.to} selects={[
        { name: "brand", label: "Бренд", all: "Все бренды", value: brand, options: brands.map((x) => ({ value: x.id, label: x.name })) },
        { name: "channel", label: "Канал", all: "Все каналы", value: channel, options: channels.map((x) => ({ value: x.id, label: `${SUPPORTED_CHANNELS[x.kind] ?? x.kind}: ${x.title}` })) },
        { name: "kind", label: "Формат", all: "Все форматы", value: kind, options: Object.entries(KIND).map(([k, v]) => ({ value: k, label: v })) },
        { name: "status", label: "Статус", all: "Все статусы", value: status, options: STATUSES.map((k) => ({ value: k, label: STATUS[k].label })) },
      ]} />
      {rows.length === 0 ? <Empty icon={<Send />} title={filtered ? "По этим фильтрам ничего нет" : "Публикаций пока нет"} text={filtered ? "Измените период или сбросьте фильтры." : "Материалы появятся здесь, когда завод напишет первый текст."} /> : (
        <div className="mx-auto w-full max-w-[600px] space-y-3">
          {rows.map((r) => (
            <Link key={r.id} href={href({ item: r.id, ...(n ? { n: String(lim) } : {}) })} scroll={false} className="block transition hover:opacity-90">
              <PostCard icon={<RoundIcon><Send size={16} /></RoundIcon>} title={r.brand} sub={KIND[r.kind]}
                when={r.planned_for ? new Date(r.planned_for).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : undefined}
                actions={<Status s={r.status} />}>
                <p className="text-sm">{r.topic}</p>
              </PostCard>
            </Link>
          ))}
          {hasMore && <div className="flex justify-center pt-1"><Link href={href({ n: String(lim + 30) })} scroll={false} className="pill">Показать ещё</Link></div>}
        </div>
      )}
    </>
  );
}
