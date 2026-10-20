import { FlaskConical, Languages, RefreshCw, Repeat2 } from "lucide-react";
import { createVariantAction, genVariantsAction, moreLikeThisAction, saveVariantsAction, setItemDateAction } from "@/lib/growth-actions";
import { VARIANT_LABEL, type AbResult } from "@/lib/growth";
import { PRICES, rub } from "@/lib/wallet";
import { ModalButton } from "@/components/ui/ModalButton";
import { SubmitButton } from "@/components/SubmitButton";
import { RegenVariantButton } from "@/components/RegenVariantButton";

const TEXT_KINDS = ["post", "story", "contest"];
const day = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "дата не задана");
const plus1 = (d: string | null) => { const b = d ? new Date(d + "T12:00:00") : new Date(); b.setDate(b.getDate() + 1); return b.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

/** Развитие материала: ещё идеи в том же духе, A/B-тест с выбором даты выхода, версии под площадки. */
export function GrowthPanel({ itemId, factoryId, kind, status, hasBody, ab, abRes, variants, free, canEdit, aDate, stamp }: {
  itemId: string; factoryId: string; kind: string; status: string; hasBody: boolean; ab: { variant: string; pair?: string } | null; abRes: AbResult | null;
  variants: Record<string, string> | null; free: boolean; canEdit: boolean; aDate: string | null; stamp: number;
}) {
  const text = TEXT_KINDS.includes(kind) && hasBody;
  const live = ["ready", "scheduled", "published"].includes(status);
  if (!canEdit || (!text && !live)) return null;
  const hid = (<><input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} /></>);
  const price = (kop: number) => (free ? "" : ` · ${rub(kop)}`);
  const editable = !["published", "generating", "scheduled"].includes(status);
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-3">
      <b className="text-sm">Развитие материала</b>
      <div className="flex flex-wrap items-center gap-2">
        <form action={moreLikeThisAction} className="flex items-center gap-1.5">{hid}<input type="hidden" name="count" value="5" />
          <SubmitButton className="pill pill-sm" title="ИИ предложит новые темы в том же духе и поставит в план"><Repeat2 size={14} />Ещё 5 идей в духе этого{price(PRICES.idea * 5)}</SubmitButton></form>
        {text && live && !ab && (
          <ModalButton stamp={stamp} label="A/B-тест" title="A/B-тест поста" icon={<FlaskConical size={14} />} className="pill pill-sm">
            <form action={createVariantAction} className="space-y-4">
              {hid}
              <p className="text-sm text-ink2">ИИ перепишет пост другим заходом: те же факты и призыв, другая первая фраза и подача. Оба варианта уходят в одни и те же каналы, потом сравниваются просмотры.</p>
              <div>
                <label className="label">Когда выпустить вариант Б</label>
                <input type="date" name="date" min={today()} defaultValue={plus1(aDate)} className="input" />
                <p className="mt-1 text-xs text-ink3">Вариант А выходит {aDate ? day(aDate) : "в свой день"}. Если оставить дату пустой, вариант Б выйдет на день позже. Результат появится, когда у обоих накопятся просмотры за сутки.</p>
              </div>
              <SubmitButton className="btn btn-accent h-11 w-full justify-center"><FlaskConical size={15} />Создать вариант Б{price(PRICES.post)}</SubmitButton>
            </form>
          </ModalButton>
        )}
        {text && !variants && editable && (
          <form action={genVariantsAction}>{hid}<SubmitButton className="pill pill-sm" title="Свой текст для Telegram, VK, MAX, короткая версия и сценарий ролика"><Languages size={14} />Версии под площадки{price(PRICES.variants)}</SubmitButton></form>
        )}
      </div>
      {ab && (
        <div className="space-y-2 rounded-2xl bg-tile p-3 text-sm">
          <b>A/B-тест: это вариант {ab.variant === "A" ? "А" : "Б"}</b>
          {abRes && (
            <>
              <p className="text-xs text-ink2">Вариант А выходит: {day(abRes.aDate)} · вариант Б: {day(abRes.bDate)}.</p>
              {abRes.aViews != null && abRes.bViews != null ? (
                <p className="text-xs text-ink2">Просмотры: А — {abRes.aViews.toLocaleString("ru-RU")}, Б — {abRes.bViews.toLocaleString("ru-RU")}.{" "}
                  {abRes.ready ? (abRes.winner === "tie" ? "Разница меньше 10%: заметной победы нет." : <b className="text-good">Победил вариант {abRes.winner === "A" ? "А" : "Б"}{abRes.diffPct != null ? ` (+${abRes.diffPct}%)` : ""}.</b>) : "Сравнение появится, когда обоим исполнится сутки."}</p>
              ) : <p className="text-xs text-ink2">Результат появится, когда у обоих вариантов накопятся просмотры.</p>}
              {abRes.bStatus && !["published", "scheduled", "generating"].includes(abRes.bStatus) && (
                <form action={setItemDateAction} className="flex flex-wrap items-center gap-2 pt-1">
                  <input type="hidden" name="id" value={abRes.bId} /><input type="hidden" name="factory" value={factoryId} />
                  <label className="text-xs text-ink2">Перенести вариант Б на</label>
                  <input type="date" name="date" min={today()} defaultValue={abRes.bDate ?? ""} className="input !w-auto !py-1.5 text-xs" />
                  <SubmitButton className="pill pill-sm">Перенести</SubmitButton>
                </form>
              )}
            </>
          )}
        </div>
      )}
      {variants && (
        <details className="rounded-2xl bg-tile p-3" open>
          <summary className="cursor-pointer text-sm font-medium">Версии под площадки ({Object.keys(variants).length})</summary>
          <form action={saveVariantsAction} className="mt-3 space-y-3">
            {hid}<input type="hidden" name="only" defaultValue="" />
            {Object.entries(VARIANT_LABEL).map(([k, label]) => (
              <div key={k}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="label !mb-0">{label}{["telegram", "vk", "max"].includes(k) ? " — уйдёт в каналы этой площадки" : " — для ручного использования"}</label>
                  {editable && <RegenVariantButton platform={k} action={genVariantsAction} title="Переписать только эту версию"><RefreshCw size={13} />{variants[k] ? "Пересоздать" : "Создать"}{price(Math.round(PRICES.variants / 3))}</RegenVariantButton>}
                </div>
                <textarea name={`v_${k}`} defaultValue={variants[k] ?? ""} rows={k === "short" ? 2 : 4} placeholder="Пусто — для этой площадки берётся основной текст" className="input !bg-surface text-sm" />
              </div>
            ))}
            <div className="flex items-center gap-3"><SubmitButton className="btn btn-accent">Сохранить версии</SubmitButton><span className="text-xs text-ink3">Пустое поле — для площадки берётся основной текст.</span></div>
          </form>
        </details>
      )}
    </div>
  );
}
