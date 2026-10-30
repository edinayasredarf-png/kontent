"use client";
import Image from "next/image";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Rail } from "./Rail";

export interface AudienceItem { title: string; text: string; img: string; ratio: number }

/** «Кому будет полезен сервис»: карточки с фото, по плюсу показывается описание. */
export function Audience({ items }: { items: AudienceItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Rail label="Кому будет полезен сервис">
      {items.map((a, i) => {
        const on = open === i, blue = i === 0;
        return (
          <article key={a.title} className={`relative flex w-[84vw] max-w-96 shrink-0 snap-start flex-col overflow-hidden rounded-3xl sm:w-96 md:h-[480px] ${blue ? "bg-[#0070F0] text-white" : "bg-[#f5f5f5] text-black"}`}>
            <h3 className="px-8 pt-8 text-center text-2xl font-semibold leading-7">{a.title}</h3>
            {on ? (
              <p className="px-8 pb-20 pt-8 text-lg font-semibold leading-6">{a.text}</p>
            ) : (
              <div className={`mt-auto pt-4 md:absolute md:inset-x-0 md:bottom-0 md:pt-0 ${a.ratio < 0.9 ? "max-h-[385px] overflow-hidden" : ""}`}>
                <Image src={a.img} alt="" width={Math.round(900 * a.ratio)} height={900} className="h-auto w-full" />
              </div>
            )}
            <button type="button" onClick={() => setOpen(on ? null : i)} aria-expanded={on} aria-label={on ? "Скрыть описание" : "Показать описание"}
              className="absolute bottom-5 right-5 grid size-10 place-items-center rounded-full bg-white text-black shadow transition hover:scale-105">
              <Plus size={22} className={`transition-transform ${on ? "rotate-45" : ""}`} />
            </button>
          </article>
        );
      })}
    </Rail>
  );
}
