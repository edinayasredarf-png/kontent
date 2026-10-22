"use client";
import { useCallback, useEffect, useRef } from "react";

/**
 * Поле ввода, которое растёт по высоте под весь текст: пока текст помещается, оно остаётся своего размера (rows), как только дошли до края — вырастает,
 * строки переносятся. Внешний ref (React 19: обычное свойство) тоже работает.
 */
export function AutoTextarea({ ref: outer, onInput, style, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; };
  const merge = useCallback((el: HTMLTextAreaElement | null) => {
    ref.current = el;
    if (typeof outer === "function") outer(el); else if (outer) (outer as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  }, [outer]);
  useEffect(() => { fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }, []);
  // значение поменялось не набором (восстановление из браузера, ИИ-правка): высота подгоняется заново
  useEffect(() => { fit(); }, [props.value]);
  return <textarea {...props} ref={merge} onInput={(e) => { fit(); onInput?.(e); }} style={{ resize: "none", overflow: "hidden", ...style }} />;
}
