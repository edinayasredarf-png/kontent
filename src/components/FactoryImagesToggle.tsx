"use client";
import { useRef } from "react";
import { setFactoryImages } from "@/lib/actions";

/** Тумблер «Картинки к материалам»: сохраняется сразу при переключении. */
export function FactoryImagesToggle({ id, on, disabled }: { id: string; on: boolean; disabled?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setFactoryImages}>
      <input type="hidden" name="id" value={id} />
      <label className="relative inline-flex cursor-pointer">
        <input type="checkbox" name="images" defaultChecked={on} disabled={disabled} onChange={() => form.current?.requestSubmit()} className="peer sr-only" aria-label="Картинки к материалам" />
        <span className="h-5 w-9 rounded-full bg-tile2 transition-colors peer-checked:bg-accent" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </label>
    </form>
  );
}
