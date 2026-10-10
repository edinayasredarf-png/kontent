import { RefreshCw } from "lucide-react";
import { CAROUSEL_STYLES } from "@/lib/postsettings";
import { INFO_LAYOUTS, type Infographic } from "@/lib/carousel/infographic";
import { saveInfographicAction } from "@/lib/carousel/actions";

/** Инфографика материала: превью и правка текстов с бесплатной перерисовкой. */
export function InfographicPanel({ itemId, factoryId, info, style, assetId, editable }: { itemId: string; factoryId: string; info: Infographic; style: string; assetId?: string; editable: boolean }) {
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <b className="text-sm">Инфографика</b>
      {assetId && (// eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/${assetId}`} alt="Инфографика" loading="lazy" className="max-h-[28rem] w-auto rounded-lg border border-line" />)}
      {editable && (
        <details className="rounded-xl bg-tile p-3">
          <summary className="cursor-pointer text-xs font-medium text-ink2">Изменить тексты и раскладку</summary>
          <form action={saveInfographicAction} className="mt-3 space-y-2">
            <input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} />
            <input name="title" defaultValue={info.title} maxLength={90} placeholder="Заголовок" className="input font-medium" />
            <input name="subtitle" defaultValue={info.subtitle} maxLength={140} placeholder="Подзаголовок" className="input" />
            <div className="flex flex-wrap gap-2">
              <select name="layout" defaultValue={info.layout} className="input !w-auto">{Object.entries(INFO_LAYOUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select name="style" defaultValue={style} className="input !w-auto">{Object.entries(CAROUSEL_STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
            {Array.from({ length: 6 }, (_, i) => info.blocks[i] ?? { head: "", text: "" }).map((b, i) => (
              <div key={i} className="rounded-xl bg-surface p-2.5">
                <input name={`head_${i}`} defaultValue={b.head} maxLength={60} placeholder={`Блок ${i + 1}: заголовок или цифра`} className="input mb-1.5 !bg-tile font-medium" />
                <input name={`text_${i}`} defaultValue={b.text} maxLength={160} placeholder="Пояснение" className="input !bg-tile text-sm" />
              </div>
            ))}
            <div className="flex items-center gap-2"><button className="btn"><RefreshCw size={14} />Сохранить и перерисовать</button><span className="text-xs text-ink3">бесплатно; пустые блоки пропускаются</span></div>
          </form>
        </details>
      )}
    </div>
  );
}
