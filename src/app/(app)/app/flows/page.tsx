import Link from "next/link";
import { Rss } from "lucide-react";
import { requireCtx, canWrite } from "@/lib/auth";
import { q } from "@/lib/db";
import { createFlowAction } from "@/lib/flows/actions";
import { Empty, PageHead } from "@/components/ui";
import { ModalButton } from "@/components/ui/ModalButton";
import { KIND_LABEL, type Kind } from "@/lib/monitor/fetchers";
import { SUPPORTED_CHANNELS } from "@/lib/publishing";

import { SubmitButton } from "@/components/SubmitButton";
export const dynamic = "force-dynamic";

export default async function Flows({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const c = await requireCtx();
  const write = canWrite(c.org.role);
  const [flows, brands, sources, channels] = await Promise.all([
    q<{ id: string; name: string; status: string; brand: string; mode: string; pending: string; queued: string; rejected: string; note: string }>(
      `select f.id,f.name,f.status,b.name brand,f.settings->>'mode' mode,f.note,
              (select count(*) from kz_flow_items i where i.flow_id=f.id and i.status in ('pending','ready')) pending,
              (select count(*) from kz_flow_items i where i.flow_id=f.id and i.status='queued') queued,
              (select count(*) from kz_flow_items i where i.flow_id=f.id and i.status='rejected') rejected
         from kz_flows f join kz_brands b on b.id=f.brand_id where f.org_id=$1 order by f.created_at`, [c.org.id]),
    q<{ id: string; name: string }>("select id,name from kz_brands where org_id=$1 order by name", [c.org.id]),
    q<{ id: string; title: string; kind: Kind }>("select id,title,kind from kz_sources where org_id=$1 and kind<>'manual' order by created_at", [c.org.id]),
    q<{ id: string; title: string; kind: string }>("select id,title,kind from kz_channels where org_id=$1 and status='active' and kind<>'wordpress' order by created_at", [c.org.id]),
  ]);
  return (
    <>
      <PageHead title="Автолента" sub="Новости из источников сами отбираются, пересказываются в вашем стиле и публикуются в ваши каналы." />
      {err && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      <div className="mx-auto w-full max-w-[560px]">
        <div className="space-y-3">
          {flows.length === 0 && <Empty icon={<Rss />} title="Потоков пока нет" text="Создайте поток: выберите источники из «Мониторинга» и каналы, куда публиковать. По умолчанию каждая новость сначала ждёт вашего одобрения." />}
          {flows.map((f) => (
            <Link key={f.id} href={`/app/flows/${f.id}`} className="card block p-5 text-center transition hover:bg-tile/50">
              <b className="block text-sm">{f.name}</b>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2"><span className={`chip ${f.status === "active" ? "!bg-good-soft !text-good" : ""}`}>{f.status === "active" ? "работает" : "пауза"}</span>
                <span className="chip">{f.mode === "auto" ? "автоматом" : "с одобрением"}</span><span className="chip">{f.brand}</span>
              </div>
              <p className="mt-3 text-xs text-ink2">Ждут: <b>{f.pending}</b> · в очереди и опубликовано: <b>{f.queued}</b> · отбраковано: <b>{f.rejected}</b></p>
              {f.note && <p className="mt-2 rounded-lg bg-warn-soft px-2 py-1 text-xs text-warn">{f.note}</p>}
            </Link>
          ))}
        </div>
        <div className="mt-5 flex justify-center">
          <ModalButton label="Добавить поток" title="Новый поток" className="pill">
          {!write ? <p className="text-sm text-ink2">Создавать потоки могут редакторы и выше.</p> : brands.length === 0 ? <p className="text-sm text-ink2">Сначала создайте бренд.</p> : (
            <form action={createFlowAction} className="space-y-3">
              <div><label className="label">Название</label><input name="name" required minLength={2} maxLength={80} placeholder="Новости города" className="input" /></div>
              <div><label className="label">Бренд</label><select name="brand" className="input">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div><span className="label">Источники</span>
                {sources.length === 0 ? <p className="text-xs text-ink3">Источников нет. Добавьте сайты, каналы и сообщества в <Link href="/app/monitor/settings" className="text-accent-ink">«Мониторинге»</Link>.</p> :
                  <div className="max-h-44 space-y-1 overflow-auto">{sources.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="sources" value={s.id} /><span className="chip">{KIND_LABEL[s.kind]}</span><span className="truncate">{s.title}</span></label>)}</div>}
              </div>
              <div><span className="label">Куда публиковать</span>
                {channels.length === 0 ? <p className="text-xs text-ink3">Каналов нет. Подключите их на странице <Link href="/app/channels" className="text-accent-ink">«Каналы»</Link>.</p> :
                  <div className="space-y-1">{channels.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="channels" value={s.id} /><span className="chip">{SUPPORTED_CHANNELS[s.kind] ?? s.kind}</span><span className="truncate">{s.title}</span></label>)}</div>}
              </div>
              <SubmitButton className="btn w-full justify-center">Создать поток</SubmitButton>
              <p className="text-xs text-ink3">Поток создаётся на паузе. Настройте фильтры, стиль и картинки, затем включите.</p>
            </form>
          )}
          </ModalButton>
        </div>
      </div>
    </>
  );
}
