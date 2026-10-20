import Link from "next/link";
import { AlertTriangle, ImageIcon, Layers, RefreshCw, Send, CalendarPlus, Sparkles, Trash2 } from "lucide-react";
import { loadDrafts, type DraftItem } from "@/lib/drafts";
import { allocateDates } from "@/lib/plan";
import { q } from "@/lib/db";
import { IMAGE_KINDS } from "@/lib/item-images";
import { PRICES, rub } from "@/lib/wallet";
import { draftAttachImageAction, draftDiscardAction, draftImageGenAction, draftPublishAction, draftRemoveImageAction, draftReworkImageAction, draftToPlanAction, regenDraftAction, saveDraftTextAction } from "@/lib/draft-actions";
import { KIND } from "@/components/ui";
import { AutoModal } from "@/components/AutoModal";
import { AutoTextarea } from "@/components/AutoTextarea";
import { ImagePicker } from "@/components/ImagePicker";
import { SubmitButton } from "@/components/SubmitButton";

const SLIDE_KINDS = ["carousel", "infographic"], NO_IMAGE = ["reels", "email", "guide", "poll"];

/**
 * Окно «Созданные материалы» поверх страницы: созданное сразу видно, его можно переписать, добавить изображение (там, где оно уместно)
 * и только потом отправить в контент-план (с датой и временем) или опубликовать сразу.
 * returnTo — страница, на которой открыто окно; к ней возвращаются после каждого действия.
 */
export async function DraftHost({ orgId, ids, returnTo, err, note, free }: { orgId: string; ids: string[]; returnTo: string; err?: string; note?: string; free: boolean }) {
  const items = await loadDrafts(orgId, ids);
  if (!items.length) return null;
  const fids = [...new Set(items.map((i) => i.factory_id))];
  const [times, dates] = await Promise.all([
    q<{ id: string; t: string | null }>("select id, schedule->'times'->>0 t from kz_factories where org_id=$1 and id = any($2::uuid[])", [orgId, fids]),
    Promise.all(fids.map(async (f) => [f, (await allocateDates(f, 1))[0] ?? ""] as const)),
  ]);
  const hid = (id: string) => (<><input type="hidden" name="id" value={id} /><input type="hidden" name="ret" value={returnTo} /><input type="hidden" name="drafts" value={items.map((x) => x.id).join(",")} /></>);
  const price = (kop: number) => (free ? "" : ` · ${rub(kop)}`);
  const priceOf = (kind: string) => (kind === "carousel" ? PRICES.carousel : kind === "seo" ? PRICES.seo : kind === "article" ? PRICES.article : kind === "reels" ? PRICES.reels : PRICES.post);

  const card = (it: DraftItem) => {
    const imageOk = IMAGE_KINDS.includes(it.kind);
    const ready = it.status === "ready";
    const date = dates.find(([f]) => f === it.factory_id)?.[1] ?? "";
    const time = times.find((t) => t.id === it.factory_id)?.t ?? "10:00";
    return (
      <article key={it.id} className="space-y-3 rounded-3xl bg-tile p-3">
        <div className="flex flex-wrap items-center gap-2"><span className="chip !bg-surface">{KIND[it.kind] ?? it.kind}</span><b className="min-w-0 flex-1 text-sm">{it.topic}</b></div>
        {!ready && it.status !== "failed" && <p className="rounded-2xl bg-surface p-3 text-sm text-ink2">Материал ещё создаётся. <Link href={`${returnTo}${returnTo.includes("?") ? "&" : "?"}draft=${items.map((x) => x.id).join(",")}`} className="font-semibold text-accent-ink">Обновить</Link></p>}
        {it.status === "failed" && (
          <form action={regenDraftAction} className="flex flex-wrap items-center gap-2 rounded-2xl bg-bad-soft p-3 text-sm text-bad">{hid(it.id)}<AlertTriangle size={15} />Не удалось создать материал.
            <SubmitButton className="pill pill-sm !text-ink"><RefreshCw size={13} />Создать заново{price(priceOf(it.kind))}</SubmitButton></form>
        )}
        {ready && (
          <>
            {SLIDE_KINDS.includes(it.kind) ? (
              <div className="space-y-2 rounded-2xl bg-surface p-3">
                <div className="flex gap-2 overflow-x-auto">{it.slides.slice(0, 10).map((sid) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={sid} src={`/api/assets/${sid}`} alt="" className="h-40 w-auto shrink-0 rounded-xl border border-line" />)}</div>
                {it.body && <p className="whitespace-pre-wrap text-sm text-ink2">{it.body.slice(0, 600)}</p>}
                <p className="text-xs text-ink3">Картинки здесь — это слайды. Править их можно в плане завода, после «В контент-план».</p>
              </div>
            ) : (
              <form action={saveDraftTextAction} className="space-y-2">
                {hid(it.id)}
                <AutoTextarea name="body" defaultValue={it.body} rows={6} className="input !rounded-2xl !bg-surface text-sm leading-6" />
                <div className="flex flex-wrap items-center gap-2">
                  <SubmitButton className="pill pill-sm">Сохранить текст</SubmitButton>
                  <SubmitButton formAction={regenDraftAction} data-confirm="Переписать материал заново? Текущий текст заменится новым, это платная генерация." data-confirm-ok="Переписать" className="pill pill-sm"><RefreshCw size={13} />Переделать заново{price(priceOf(it.kind))}</SubmitButton>
                </div>
              </form>
            )}

            {imageOk ? (
              <div className="space-y-2 rounded-2xl bg-surface p-3">
                <b className="text-xs font-semibold text-ink2">Изображение к посту</b>
                {it.image_error && <p className="flex items-center gap-1.5 text-xs text-warn"><AlertTriangle size={13} />{it.image_error}</p>}
                {it.image_id && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/assets/${it.image_id}`} alt="Изображение к материалу" className="max-h-56 w-auto max-w-full rounded-xl border border-line" />
                    <form action={draftReworkImageAction} className="flex flex-wrap items-center gap-2">
                      {hid(it.id)}
                      <input name="instruction" maxLength={400} placeholder="Доработать ИИ: убрать фон, добавить тёплые тона…" className="input min-w-[12rem] flex-1 !bg-tile text-xs" />
                      <SubmitButton className="pill pill-sm !bg-accent !text-white"><Sparkles size={13} />Доработать{price(PRICES.image)}</SubmitButton>
                      <SubmitButton formAction={draftRemoveImageAction} data-confirm="Убрать изображение у материала?" data-confirm-ok="Убрать" className="text-xs text-ink2 hover:text-bad">Убрать</SubmitButton>
                    </form>
                  </>
                )}
                <form action={draftAttachImageAction} className="flex flex-wrap items-center gap-2">
                  {hid(it.id)}
                  <ImagePicker label={it.image_id ? "Заменить своим" : "Прикрепить своё изображение"} className="min-w-0" />
                  <SubmitButton className="pill pill-sm">Загрузить</SubmitButton>
                </form>
                <form action={draftImageGenAction} className="flex flex-wrap items-center gap-2">
                  {hid(it.id)}
                  <input name="prompt" maxLength={500} placeholder="Описание картинки (необязательно)" className="input min-w-[12rem] flex-1 !bg-tile text-xs" />
                  <SubmitButton className="pill pill-sm"><ImageIcon size={13} />{it.image_id ? "Создать заново" : "Создать картинку ИИ"}{price(PRICES.image)}</SubmitButton>
                </form>
              </div>
            ) : !SLIDE_KINDS.includes(it.kind) && (
              <p className="rounded-2xl bg-surface p-3 text-xs text-ink3">{NO_IMAGE.includes(it.kind) ? "К этому формату изображение не прикрепляется: оно не публикуется вместе с материалом." : ""}</p>
            )}

            <div className="space-y-2 rounded-2xl bg-surface p-3">
              {it.channels.length ? <p className="text-xs text-ink2">Уйдёт в каналы: {it.channels.join(", ")}</p> : <p className="flex items-center gap-1.5 text-xs text-warn"><AlertTriangle size={13} />У завода не выбраны каналы публикации. Включите их во вкладке «Настройки контента».</p>}
              <div className="flex flex-wrap items-center gap-2">
                <details className="group">
                  <summary className="btn btn-accent !py-2 cursor-pointer list-none"><CalendarPlus size={15} />В контент-план</summary>
                  <form action={draftToPlanAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-tile p-3">
                    {hid(it.id)}
                    <div><label className="label">Дата публикации</label><input type="date" name="date" required defaultValue={date} min={new Date().toISOString().slice(0, 10)} className="input !w-auto !bg-surface" /></div>
                    <div><label className="label">Время</label><input type="time" name="time" required defaultValue={time} className="input !w-auto !bg-surface" /></div>
                    <SubmitButton className="btn !py-2">Поставить в план</SubmitButton>
                    <p className="w-full text-xs text-ink3">В выбранное время материал сам уйдёт в каналы завода. Время по часовому поясу завода.</p>
                  </form>
                </details>
                <form action={draftPublishAction}>{hid(it.id)}<SubmitButton data-confirm="Опубликовать материал сейчас во все каналы завода?" data-confirm-ok="Опубликовать" className="pill"><Send size={15} />Опубликовать сейчас</SubmitButton></form>
                <form action={draftDiscardAction} className="ml-auto">{hid(it.id)}<SubmitButton data-confirm="Удалить этот материал? Вернуть его будет нельзя." className="grid size-10 place-items-center rounded-full bg-bad-soft text-bad hover:opacity-80" title="Удалить черновик" aria-label="Удалить черновик"><Trash2 size={15} /></SubmitButton></form>
              </div>
            </div>
          </>
        )}
      </article>
    );
  };

  return (
    <AutoModal title={items.length > 1 ? `Созданные материалы (${items.length})` : "Созданный материал"} closeHref={returnTo}>
      <div className="space-y-4">
        {err && <p className="flex items-center gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad"><AlertTriangle size={16} />{err}</p>}
        {note && <p className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">{note}</p>}
        <p className="flex items-center gap-2 text-xs text-ink3"><Layers size={13} />Материал пока в черновиках: в плане и публикациях его нет. Посмотрите, при необходимости поправьте, затем отправьте в план или опубликуйте.</p>
        {items.map(card)}
      </div>
    </AutoModal>
  );
}
