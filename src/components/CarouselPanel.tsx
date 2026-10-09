import { Download, ImageIcon, RefreshCw, X } from "lucide-react";
import { CAROUSEL_STYLES } from "@/lib/postsettings";
import { carouselCoverAction, saveCarouselAction } from "@/lib/carousel/actions";
import { PRICES, rub } from "@/lib/wallet";

export interface CarouselMeta { slides: { title: string; body: string }[]; style: keyof typeof CAROUSEL_STYLES }

/** Слайды карусели у материала: превью, правка текстов с перерисовкой, обложка нейросетью, скачивание архивом. */
export function CarouselPanel({ itemId, factoryId, meta, assets, editable, free }: { itemId: string; factoryId: string; meta: CarouselMeta; assets: { id: string }[]; editable: boolean; free: boolean }) {
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm">Слайды карусели ({assets.length})</b>
        <a href={`/api/export/${itemId}/carousel`} className="btn btn-ghost ml-auto !py-1.5"><Download size={14} />Скачать архивом</a>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {assets.map((a, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={a.id} src={`/api/assets/${a.id}`} alt={`Слайд ${i + 1}`} loading="lazy" className="h-56 w-auto shrink-0 rounded-lg border border-line" />
        ))}
      </div>
      {editable && (<>
        <details className="rounded-xl bg-tile p-3">
          <summary className="cursor-pointer text-xs font-medium text-ink2">Изменить тексты слайдов и оформление</summary>
          <form action={saveCarouselAction} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} />
            {meta.slides.map((s, i) => (
              <div key={i} className="rounded-xl bg-surface p-2.5">
                <div className="mb-1 text-xs text-ink3">{i === 0 ? "Обложка" : i === meta.slides.length - 1 ? `Слайд ${i + 1} — призыв` : `Слайд ${i + 1}`}</div>
                <input name={`title_${i}`} defaultValue={s.title} maxLength={90} placeholder="Заголовок" className="input mb-1.5 !bg-tile font-medium" />
                <textarea name={`body_${i}`} defaultValue={s.body} rows={2} maxLength={320} placeholder="Текст" className="input !bg-tile text-sm" />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <select name="style" defaultValue={meta.style} className="input !w-auto">{Object.entries(CAROUSEL_STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <button className="btn"><RefreshCw size={14} />Сохранить и перерисовать</button>
              <span className="text-xs text-ink3">бесплатно</span>
            </div>
          </form>
        </details>
        <div className="flex flex-wrap gap-2">
          <form action={carouselCoverAction}><input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} /><input type="hidden" name="mode" value="ai" />
            <button className="btn btn-ghost !py-1.5"><ImageIcon size={14} />Новая обложка нейросетью{free ? "" : ` · ${rub(PRICES.image)}`}</button></form>
          <form action={carouselCoverAction}><input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} /><input type="hidden" name="mode" value="none" />
            <button className="btn btn-ghost !py-1.5"><X size={14} />Обложка без картинки</button></form>
        </div>
      </>)}
    </div>
  );
}
