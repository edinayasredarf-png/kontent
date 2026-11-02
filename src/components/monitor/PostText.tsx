"use client";
import { useEffect, useRef, useState } from "react";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Текст новости в карточке. В Telegram и VK заголовок — это начало самого поста, поэтому дублировать его не нужно:
 * если заголовок повторяет начало текста, показываем один полный текст. Длинный пост сворачивается с кнопкой «Показать полностью».
 */
export function PostText({ title, text, full = false }: { title: string; text: string; full?: boolean }) {
  const body = text.trim();
  const head = norm(title).replace(/[….]+$/, "");
  const dup = !body || norm(body).startsWith(head) || head.startsWith(norm(body).slice(0, 80));
  const box = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false), [long, setLong] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || full) return;
    const measure = () => setLong(el.scrollHeight > 184);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, [body, full]);
  const shown = dup ? (body || title) : body;
  return (
    <>
      {!dup && <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>}
      {shown && (
        <div className={dup ? "" : "mt-2"}>
          <p ref={box} className={`whitespace-pre-wrap break-words text-sm leading-6 ${open || full ? "" : "max-h-[184px] overflow-hidden"}`} style={!open && !full && long ? { maskImage: "linear-gradient(#000 70%, transparent)" } : undefined}>{shown}</p>
          {!full && long && <button type="button" onClick={() => setOpen(!open)} className="link-btn mt-2">{open ? "Свернуть" : "Показать полностью"}</button>}
        </div>
      )}
    </>
  );
}
