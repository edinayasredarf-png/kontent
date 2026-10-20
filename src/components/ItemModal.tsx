import Link from "next/link";
import { AlertTriangle, CalendarClock, ExternalLink, Send } from "lucide-react";
import { q } from "@/lib/db";
import { KIND, Status } from "@/components/ui";
import { AutoModal } from "@/components/AutoModal";
import { SubmitButton } from "@/components/SubmitButton";
import { itemPublishAction, itemRescheduleAction } from "@/lib/item-modal-actions";

const NO_PUBLISH = ["reels", "email", "guide"], EDITABLE = ["idea", "approved", "ready", "failed", "rejected"];
const plain = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const CH: Record<string, string> = { telegram: "Telegram", vk: "ВКонтакте", max: "MAX", wordpress: "WordPress", webhook: "Webhook" };
const PUB: Record<string, string> = { queued: "в очереди", sending: "отправляется", published: "опубликовано", failed: "ошибка" };

/**
 * Окно материала поверх календаря и публикаций: вся информация в одном месте, дальше — к плану завода, перенос даты или публикация.
 * returnTo — страница, на которой открыто окно (адрес без параметра item).
 */
export async function ItemModal({ orgId, id, returnTo, err, note, canWrite }: { orgId: string; id: string; returnTo: string; err?: string; note?: string; canWrite: boolean }) {
  const [it] = await q<{
    id: string; kind: string; topic: string; hook: string; body: string; status: string; image_id: string | null; factory_id: string | null; factory: string | null; brand: string;
    planned: string | null; pub_at: string | null; ptime: string | null; draft: boolean; slides: string[] | null; chans: string[] | null;
  }>(
    `select i.id,i.kind,i.topic,i.hook,i.body,i.status,i.image_id,i.factory_id,f.name factory,b.name brand,
            to_char(i.planned_for,'YYYY-MM-DD') planned, i.meta->>'publishAt' pub_at,
            to_char((i.meta->>'publishAt')::timestamptz at time zone coalesce(f.schedule->>'tz','Europe/Moscow'),'HH24:MI') ptime,
            coalesce((i.meta->>'draft')::boolean,false) draft,
            (select array_agg(a.id order by a.position) from kz_assets a where a.item_id=i.id and a.position>=0) slides,
            (select array_agg(ch.title order by ch.created_at) from kz_channels ch where ch.id = any(f.channel_ids)) chans
       from kz_content_items i join kz_brands b on b.id=i.brand_id left join kz_factories f on f.id=i.factory_id where i.id=$1 and i.org_id=$2`, [id, orgId]);
  if (!it) return null;
  const pubs = await q<{ channel: string; kind: string; status: string; url: string | null; error: string | null; at: string | null }>(
    `select ch.title channel,ch.kind,p.status,p.external_url url,p.error,to_char(p.published_at,'DD.MM.YYYY HH24:MI') at from kz_publications p join kz_channels ch on ch.id=p.channel_id where p.item_id=$1 and p.org_id=$2 order by p.created_at`, [id, orgId]);
  const hid = (<><input type="hidden" name="id" value={it.id} /><input type="hidden" name="ret" value={returnTo} /></>);
  const dayLabel = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "не задана");
  const text = ["seo", "email", "guide"].includes(it.kind) ? plain(it.body) : it.body;
  const editable = EDITABLE.includes(it.status);
  const canPublish = canWrite && ["ready", "failed"].includes(it.status) && !NO_PUBLISH.includes(it.kind) && !it.draft && it.factory_id;
  const today = new Date().toISOString().slice(0, 10);
  const planHref = it.factory_id ? `/app/factories/${it.factory_id}?tab=plan&view=list&open=${it.id}#i-${it.id}` : null;

  return (
    <AutoModal title={KIND[it.kind] ?? it.kind} closeHref={returnTo}>
      <div className="space-y-4">
        {err && <p className="flex items-center gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{err}</p>}
        {note && <p className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">{note}</p>}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2"><Status s={it.status} />{it.draft && <span className="chip">черновик</span>}</div>
          <h3 className="text-lg font-semibold leading-snug">{it.topic}</h3>
          <p className="text-sm text-ink2">{it.brand}{it.factory ? ` · ${it.factory}` : ""}</p>
        </div>

        <div className="grid gap-3 rounded-2xl bg-tile p-4 text-sm sm:grid-cols-2">
          <div><span className="text-xs text-ink3">Дата выхода</span><p className="font-medium">{dayLabel(it.planned)}{it.ptime ? ` в ${it.ptime}` : ""}</p></div>
          <div><span className="text-xs text-ink3">Каналы публикации</span><p className="font-medium">{it.chans?.length ? it.chans.join(", ") : "не выбраны"}</p></div>
        </div>

        {it.hook && <p className="text-sm text-ink2"><b>Хук:</b> {it.hook}</p>}
        {it.slides?.length ? (
          <div className="flex gap-2 overflow-x-auto">{it.slides.slice(0, 10).map((sid) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={sid} src={`/api/assets/${sid}`} alt="" className="h-44 w-auto shrink-0 rounded-xl border border-line" />)}</div>
        ) : it.image_id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/assets/${it.image_id}`} alt="Изображение к материалу" className="max-h-64 w-auto max-w-full rounded-xl border border-line" />
        ) : null}
        {text && <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-tile p-4 text-sm leading-6">{text.slice(0, 4000)}</div>}

        {pubs.length > 0 && (
          <div className="space-y-1.5 rounded-2xl bg-tile p-4 text-sm">
            <b>Публикации</b>
            {pubs.map((p, k) => (
              <p key={k} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="chip !bg-surface">{CH[p.kind] ?? p.kind}: {p.channel}</span>
                <span className={p.status === "published" ? "text-good" : p.status === "failed" ? "text-bad" : "text-ink2"}>{PUB[p.status] ?? p.status}{p.at ? ` · ${p.at}` : ""}</span>
                {p.url && <a href={p.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-ink">открыть<ExternalLink size={11} /></a>}
                {p.error && (p.status === "published" ? <span className="w-full rounded-xl bg-warn-soft px-3 py-2 text-warn">Опубликовано, но: {p.error}</span> : <span className="text-bad">{p.error.slice(0, 240)}</span>)}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {planHref && <Link href={planHref} className="btn btn-accent !py-2">Открыть в контент-плане</Link>}
          {canPublish && (
            <form action={itemPublishAction}>{hid}
              <SubmitButton data-confirm="Опубликовать материал сейчас во все каналы завода?" data-confirm-ok="Опубликовать" className="pill"><Send size={15} />{it.status === "failed" ? "Повторить публикацию" : "Опубликовать сейчас"}</SubmitButton></form>
          )}
        </div>

        {canWrite && editable && !it.draft && (
          <form action={itemRescheduleAction} className="flex flex-wrap items-end gap-2 rounded-2xl bg-tile p-4">
            {hid}
            <div><label className="label">Перенести на дату</label><input type="date" name="date" required defaultValue={it.planned ?? ""} min={today} className="input !w-auto !bg-surface" /></div>
            {it.status === "ready" && <div><label className="label">Время</label><input type="time" name="time" defaultValue={it.ptime ?? ""} className="input !w-auto !bg-surface" /></div>}
            <SubmitButton className="pill"><CalendarClock size={15} />Перенести</SubmitButton>
            {it.status === "ready" && <p className="w-full text-xs text-ink3">Если указать время, в этот момент материал сам уйдёт в каналы завода.</p>}
          </form>
        )}
      </div>
    </AutoModal>
  );
}
