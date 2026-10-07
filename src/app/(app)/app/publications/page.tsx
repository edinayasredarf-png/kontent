import { Send } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PageHead, Empty, Status, KIND } from "@/components/ui";

export default async function Publications() {
  const c = await requireCtx();
  const rows = await q<{ id: string; topic: string; kind: string; status: string; brand: string; planned_for: string | null }>(
    `select i.id,i.topic,i.kind,i.status,b.name brand,to_char(i.planned_for,'YYYY-MM-DD') planned_for from kz_content_items i join kz_brands b on b.id=i.brand_id
      where i.org_id=$1 and i.status in ('ready','scheduled','published','failed') order by coalesce(i.scheduled_at,i.created_at) desc limit 200`, [c.org.id]);
  return (
    <>
      <PageHead title="Публикации" sub="Готовые материалы, очередь и опубликованное." />
      {rows.length === 0 ? <Empty icon={<Send />} title="Публикаций пока нет" text="Материалы появятся здесь, когда завод напишет первый текст." /> : (
        <div className="card overflow-x-auto">
          {rows.map((r) => (
            <div key={r.id} className="flex min-w-[480px] items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              <span className="chip">{KIND[r.kind]}</span><span className="min-w-0 flex-1 truncate text-sm">{r.topic}</span><span className="text-xs text-ink3">{r.brand}</span><Status s={r.status} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
