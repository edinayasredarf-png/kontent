"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";

/** Окно, которое открыто сразу при загрузке страницы (по параметру адреса). Закрытие убирает параметр. */
export function AutoModal({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [closed, setClosed] = useState(false), [closing, setClosing] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || closed) return null;
  const close = () => {
    if (closing) return;
    setClosing(true); // окно плавно гаснет, а переход на страницу без параметра идёт параллельно, позиция ленты не меняется
    // переход на страницу без параметра убирает окно с сервера, поэтому начинаем его после того, как анимация закончилась
    setTimeout(() => { router.replace(closeHref, { scroll: false }); setClosed(true); }, 200);
    // если переход затянулся (медленная сеть), повторяем его мягко, без перезагрузки страницы
    setTimeout(() => { const q = location.search; if (q.includes("draft=") || q.includes("item=")) router.replace(closeHref, { scroll: false }); }, 3000);
  };
  return <Modal title={title} wide onClose={close} closing={closing}>{children}</Modal>;
}
