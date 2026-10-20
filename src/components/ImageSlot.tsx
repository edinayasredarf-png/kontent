"use client";
import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";
import { shrink } from "@/components/ImagePicker";

type Act = (f: FormData) => void | Promise<void>;

/**
 * Изображение материала с управлением прямо на нём: крестик (убрать), иконка «заменить» и всплывающая кнопка «Заменить изображение» при наведении.
 * Выбранный файл уменьшается на устройстве и сразу отправляется. Два режима:
 * — отдельный (fields — скрытые поля формы: id и т.д.): компонент сам рисует свои формы;
 * — inForm: кнопки работают через formAction внутри уже существующей формы (там же лежат нужные поля).
 */
export function ImageSlot({ src, alt = "Изображение", replaceAction, removeAction, fields, inForm, removeConfirm = "Убрать изображение у материала?", className = "" }: {
  src: string; alt?: string; replaceAction: Act; removeAction: Act; fields?: React.ReactNode; inForm?: boolean; removeConfirm?: string; className?: string;
}) {
  const file = useRef<HTMLInputElement>(null), send = useRef<HTMLButtonElement>(null), form = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState("");
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; setErr("");
    if (!f) return;
    try {
      const out = await shrink(f);
      const dt = new DataTransfer(); dt.items.add(out); e.target.files = dt.files;
      if (inForm) send.current?.click(); else form.current?.requestSubmit();
    } catch (x) { setErr((x as Error).message); e.target.value = ""; }
  };
  const input = <input ref={file} type="file" name="image" accept="image/jpeg,image/png,image/webp" onChange={pick} className="sr-only" tabIndex={-1} aria-hidden />;
  const circle = "grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75";
  return (
    <div className={className}>
      <div className="group relative inline-block max-w-full overflow-hidden rounded-xl border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block max-h-64 w-auto max-w-full" />
        <div className="absolute right-2 top-2 flex gap-1.5">
          <button type="button" onClick={() => file.current?.click()} className={circle} title="Заменить изображение" aria-label="Заменить изображение"><ImagePlus size={16} /></button>
          {inForm
            ? <SubmitButton formAction={removeAction} data-confirm={removeConfirm} data-confirm-ok="Убрать" className={circle} title="Убрать изображение" aria-label="Убрать изображение"><X size={17} /></SubmitButton>
            : <form action={removeAction}>{fields}<SubmitButton data-confirm={removeConfirm} data-confirm-ok="Убрать" className={circle} title="Убрать изображение" aria-label="Убрать изображение"><X size={17} /></SubmitButton></form>}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/60 to-transparent p-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
          <button type="button" onClick={() => file.current?.click()} className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black shadow transition hover:bg-white/90"><ImagePlus size={15} />Заменить изображение</button>
        </div>
      </div>
      {inForm ? (<>{input}<SubmitButton ref={send} formAction={replaceAction} className="sr-only" tabIndex={-1} aria-hidden>Заменить</SubmitButton></>) : <form ref={form} action={replaceAction} className="sr-only">{fields}{input}</form>}
      {err && <p className="mt-1 text-xs text-bad">{err}</p>}
    </div>
  );
}
