import { FlaskConical, Languages, Repeat2 } from "lucide-react";
import { createVariantAction, genVariantsAction, moreLikeThisAction, saveVariantsAction } from "@/lib/growth-actions";
import { VARIANT_LABEL, type AbResult } from "@/lib/growth";
import { PRICES, rub } from "@/lib/wallet";

const TEXT_KINDS = ["post", "story", "contest"];

/** Развитие материала: ещё идеи в том же духе, A/B-вариант, версии под площадки. */
export function GrowthPanel({ itemId, factoryId, kind, status, hasBody, ab, abRes, variants, free, canEdit }: {
  itemId: string; factoryId: string; kind: string; status: string; hasBody: boolean; ab: { variant: string; pair?: string } | null; abRes: AbResult | null;
  variants: Record<string, string> | null; free: boolean; canEdit: boolean;
}) {
  const text = TEXT_KINDS.includes(kind) && hasBody;
  const live = ["ready", "scheduled", "published"].includes(status);
  if (!canEdit || (!text && !live)) return null;
  const hid = (<><input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} /></>);
  const price = (kop: number) => (free ? "" : ` · ${rub(kop)}`);
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <b className="text-sm">Развитие материала</b>
      <div className="flex flex-wrap items-center gap-2">
        <form action={moreLikeThisAction} className="flex items-center gap-1.5">{hid}<input type="hidden" name="count" value="5" />
          <button className="btn btn-ghost !py-1.5" title="ИИ предложит новые темы в том же духе и поставит в план"><Repeat2 size={14} />Ещё 5 идей в духе этого{price(PRICES.idea * 5)}</button></form>
        {text && live && !ab && <form action={createVariantAction}>{hid}<button className="btn btn-ghost !py-1.5" title="Второй вариант того же поста, выйдет на день позже"><FlaskConical size={14} />A/B-вариант{price(PRICES.post)}</button></form>}
        {text && !variants && !["published", "generating"].includes(status) && <form action={genVariantsAction}>{hid}<button className="btn btn-ghost !py-1.5" title="Свой текст для Telegram, VK, MAX, короткая версия и сценарий ролика"><Languages size={14} />Версии под площадки{price(PRICES.variants)}</button></form>}
      </div>
      {ab && (
        <div className="rounded-xl bg-tile p-3 text-sm">
          <b>A/B-тест: вариант {ab.variant === "A" ? "А" : "Б"}</b>
          {abRes && abRes.aViews != null && abRes.bViews != null ? (
            <p className="mt-1 text-xs text-ink2">Просмотры: А — {abRes.aViews.toLocaleString("ru-RU")}, Б — {abRes.bViews.toLocaleString("ru-RU")}.{" "}
              {abRes.ready ? (abRes.winner === "tie" ? "Разница меньше 10%: заметной победы нет." : <b className="text-good">Победил вариант {abRes.winner === "A" ? "А" : "Б"}{abRes.diffPct != null ? ` (+${abRes.diffPct}%)` : ""}: используйте такой заход чаще.</b>) : "Сравнение станет честным, когда оба варианта проживут сутки."}</p>
          ) : <p className="mt-1 text-xs text-ink2">Вариант Б выйдет на день позже варианта А. Результат появится, когда у обоих накопятся просмотры.</p>}
        </div>
      )}
      {variants && (
        <details className="rounded-xl bg-tile p-3">
          <summary className="cursor-pointer text-xs font-medium text-ink2">Версии под площадки ({Object.keys(variants).length})</summary>
          <form action={saveVariantsAction} className="mt-3 space-y-2">
            {hid}
            {Object.entries(VARIANT_LABEL).map(([k, label]) => (
              <div key={k}><label className="label">{label}{["telegram", "vk", "max"].includes(k) ? " — уйдёт в каналы этой площадки" : " — для ручного использования"}</label>
                <textarea name={`v_${k}`} defaultValue={variants[k] ?? ""} rows={k === "short" ? 2 : 4} className="input !bg-surface text-sm" /></div>
            ))}
            <div className="flex items-center gap-3"><button className="btn btn-ghost !py-1.5">Сохранить версии</button><span className="text-xs text-ink3">Пустое поле — для площадки берётся основной текст.</span></div>
          </form>
        </details>
      )}
    </div>
  );
}
