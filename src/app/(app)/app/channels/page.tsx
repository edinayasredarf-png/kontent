import { Radio, Trash2 } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { ChannelForm } from "@/components/ChannelForm";
import { deleteChannel } from "@/lib/actions";
import { PageHead, Empty } from "@/components/ui";

import { SUPPORTED_CHANNELS as KINDS } from "@/lib/publishing";

export default async function Channels() {
  const c = await requireCtx();
  const brands = await q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]);
  const rows = await q<{ id: string; kind: string; title: string; brand: string }>(
    "select ch.id,ch.kind,ch.title,b.name brand from kz_channels ch join kz_brands b on b.id=ch.brand_id where ch.org_id=$1 order by ch.created_at", [c.org.id]);
  return (
    <>
      <PageHead title="Каналы" sub="Куда публикуем. Канал принадлежит бренду." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          {rows.length === 0 ? <Empty icon={<Radio />} title="Каналов нет" text="Подключите Telegram-канал или VK-сообщество справа." /> : (
            <div className="card">{rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                <span className="chip">{KINDS[r.kind] ?? r.kind}</span><span className="flex-1 text-sm">{r.title}</span><span className="text-xs text-ink3">{r.brand}</span>
                <form action={deleteChannel}><input type="hidden" name="id" value={r.id} /><button className="text-ink3 hover:text-bad"><Trash2 size={15} /></button></form>
              </div>))}
            </div>
          )}
        </div>
        <div className="card h-fit p-5">
          <b className="mb-4 block text-sm">Добавить канал</b>
          {brands.length === 0 ? <p className="text-sm text-ink2">Сначала создайте бренд.</p> : <ChannelForm brands={brands} />}
        </div>
      </div>
    </>
  );
}
