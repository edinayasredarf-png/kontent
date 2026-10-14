"use client";
import Image from "next/image";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Rail } from "./Rail";

export interface AudienceItem { title: string; text: string }

/** «Кому будет полезен сервис»: карточки с фото, по плюсу показывается описание. */
export function Audience({ items }: { items: AudienceItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Rail label="Кому будет полезен сервис">
      {items.map((a, i) => {
        const on = open === i, blue = i === 0;
        return (
          <article key={a.title} className={`relative h-[480px] w-[84vw] max-w-96 shrink-0 snap-start overflow-hidden rounded-3xl sm:w-96 ${blue ? "bg-[#1734fc] text-white" : "bg-[#f5f5f5] text-black"}`}>
            <h3 className="px-8 pt-8 text-center text-2xl font-semibold leading-7">{a.title}</h3>
            {on ? (
              <p className="px-8 pt-8 text-lg font-semibold leading-6">{a.text}</p>
            ) : (
              <Image src="/landing/person.png" alt="" width={367} height={305} className="absolute bottom-0 left-1/2 h-auto w-[96%] -translate-x-1/2" />
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
