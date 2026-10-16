"use client";
import { useEffect, useRef } from "react";

/** Поле ввода, которое растёт по высоте под весь текст, чтобы длинный текст не приходилось прокручивать внутри поля. */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; };
  useEffect(() => { fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }, []);
  return <textarea {...props} ref={ref} onInput={(e) => { fit(); props.onInput?.(e); }} style={{ resize: "none", overflow: "hidden", ...props.style }} />;
}
