"use client";
import { useEffect, useRef, useState } from "react";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Текст новости в карточке. В Telegram и VK заголовок — это начало самого поста, поэтому дублировать его не нужно:
 * если заголовок повторяет начало текста, показываем один полный текст. Длинный пост сворачивается с кнопкой «Показать полностью».
 */
export function PostText({ title, text }: { title: string; text: string }) {
  const body = text.trim();
  const head = norm(title).replace(/[….]+$/, "");
  const dup = !body || norm(body).startsWith(head) || head.startsWith(norm(body).slice(0, 80));
  const box = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false), [long, setLong] = useState(false);
  useEffect(() => { const el = box.current; if (el) setLong(el.scrollHeight > 190); }, [body]);
  const shown = dup ? (body || title) : body;
  return (
    <>
      {!dup && <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>}
      {shown && (
        <div className={dup ? "" : "mt-2"}>
          <p ref={box} className={`whitespace-pre-line break-words text-sm leading-6 ${dup ? "" : ""} ${open ? "" : "max-h-[184px] overflow-hidden"}`} style={!open && long ? { maskImage: "linear-gradient(#000 70%, transparent)" } : undefined}>{shown}</p>
          {long && <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-sm font-semibold text-accent-ink hover:underline">{open ? "Свернуть" : "Показать полностью"}</button>}
        </div>
      )}
    </>
  );
}
