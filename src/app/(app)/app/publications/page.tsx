import Link from "next/link";
import { Send } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PageHead, Empty, Status, KIND } from "@/components/ui";
import { PostCard, RoundIcon } from "@/components/ui/PostCard";

export default async function Publications({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n } = await searchParams;
  const lim = Math.min(400, Math.max(30, Math.round(Number(n)) || 30));
  const c = await requireCtx();
  const rows = await q<{ id: string; topic: string; kind: string; status: string; brand: string; planned_for: string | null }>(
    `select i.id,i.topic,i.kind,i.status,b.name brand,to_char(i.planned_for,'YYYY-MM-DD') planned_for from kz_content_items i join kz_brands b on b.id=i.brand_id
      where i.org_id=$1 and not coalesce((i.meta->>'draft')::boolean,false) and i.status in ('ready','scheduled','published','failed') order by coalesce(i.scheduled_at,i.created_at) desc limit ${lim + 1}`, [c.org.id]);
  const hasMore = rows.length > lim; if (hasMore) rows.length = lim;
  return (
    <>
      <PageHead title="Публикации" sub="Готовые материалы, очередь и опубликованное." />
      {rows.length === 0 ? <Empty icon={<Send />} title="Публикаций пока нет" text="Материалы появятся здесь, когда завод напишет первый текст." /> : (
        <div className="mx-auto w-full max-w-[600px] space-y-3">
          {rows.map((r) => (
            <PostCard key={r.id} icon={<RoundIcon><Send size={16} /></RoundIcon>} title={r.brand} sub={KIND[r.kind]}
              when={r.planned_for ? new Date(r.planned_for).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : undefined}
              actions={<Status s={r.status} />}>
              <p className="text-sm">{r.topic}</p>
            </PostCard>
          ))}
          {hasMore && <div className="flex justify-center pt-1"><Link href={`/app/publications?n=${lim + 30}`} scroll={false} className="pill">Показать ещё</Link></div>}
        </div>
      )}
    </>
  );
}
