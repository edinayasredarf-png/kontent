import { Download, ImageIcon, X } from "lucide-react";
import { CAROUSEL_STYLES } from "@/lib/postsettings";
import { carouselCoverAction, resetSlideAction } from "@/lib/carousel/actions";
import { CarouselEditor } from "./CarouselEditor";
import { SlideEditor } from "./SlideEditor";
import { CopyText } from "./CopyText";
import type { SlideLayout } from "@/lib/carousel/layouts";
import { PRICES, rub } from "@/lib/wallet";

export interface CarouselMeta { custom?: number[]; slides: { title: string; body: string; layout?: SlideLayout }[]; style: keyof typeof CAROUSEL_STYLES }

/** Слайды карусели у материала: превью, правка текстов с перерисовкой, обложка нейросетью, скачивание архивом. */
export function CarouselPanel({ itemId, factoryId, meta, assets, editable, free, colors = [], caption = "" }: { itemId: string; factoryId: string; meta: CarouselMeta; assets: { id: string }[]; editable: boolean; free: boolean; colors?: string[]; caption?: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm">Слайды карусели ({assets.length})</b>
        {caption.trim() && <span className="ml-auto"><CopyText text={caption} label="Копировать подпись" /></span>}
        <a href={`/api/export/${itemId}/carousel`} className="btn btn-ghost !py-1.5"><Download size={14} />Скачать архивом</a>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {assets.map((a, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <div key={a.id} className="group relative shrink-0"><img src={`/api/assets/${a.id}`} alt={`Слайд ${i + 1}`} loading="lazy" className="h-56 w-auto rounded-lg border border-line" /><a href={`/api/assets/${a.id}?dl=1`} download title={`Скачать слайд ${i + 1}`} aria-label={`Скачать слайд ${i + 1}`} className="absolute right-1.5 top-1.5 rounded-lg bg-surface/90 p-1.5 text-ink2 opacity-0 shadow transition hover:text-ink group-hover:opacity-100 focus:opacity-100"><Download size={14} /></a></div>
        ))}
      </div>
      {editable && <SlideEditor itemId={itemId} targets={assets.map((a, i) => ({ key: `slide:${i}`, label: `Слайд ${i + 1}${meta.custom?.includes(i) ? " ✎" : ""}`, assetId: a.id }))} colors={colors} />}
      {editable && (meta.custom?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink2">Слайды с ручной правкой не перерисовываются при смене текста:
          {meta.custom!.map((n) => <form key={n} action={resetSlideAction}><input type="hidden" name="id" value={itemId} /><input type="hidden" name="factory" value={factoryId} /><input type="hidden" name="pos" value={n} /><button className="btn btn-ghost !px-2.5 !py-1 text-xs">Вернуть слайд {n + 1}</button></form>)}</div>
      )}
      {editable && (<>
        <details className="rounded-xl bg-tile p-3">
          <summary className="cursor-pointer text-xs font-medium text-ink2">Изменить тексты слайдов и оформление</summary>
          <div className="mt-3"><CarouselEditor itemId={itemId} factoryId={factoryId} slides={meta.slides} style={meta.style} styles={CAROUSEL_STYLES} /></div>
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
