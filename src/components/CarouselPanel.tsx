import { Download, ImageIcon, X } from "lucide-react";
import { CAROUSEL_STYLES } from "@/lib/postsettings";
import { carouselCoverAction } from "@/lib/carousel/actions";
import { CarouselEditor } from "./CarouselEditor";
import type { SlideLayout } from "@/lib/carousel/layouts";
import { PRICES, rub } from "@/lib/wallet";

export interface CarouselMeta { slides: { title: string; body: string; layout?: SlideLayout }[]; style: keyof typeof CAROUSEL_STYLES }

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
