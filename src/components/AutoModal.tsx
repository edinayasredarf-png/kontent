"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";

/** Окно, которое открыто сразу при загрузке страницы (по параметру адреса). Закрытие убирает параметр. */
export function AutoModal({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || closed) return null;
  const close = () => {
    setClosed(true); // окно пропадает сразу, не дожидаясь перехода
    router.replace(closeHref, { scroll: false });
    // если переход не состоялся, уходим жёстко
    setTimeout(() => { const s = location.search; if (s.includes("draft=") || s.includes("item=")) location.assign(closeHref); }, 1500);
  };
  return <Modal title={title} wide onClose={close}>{children}</Modal>;
}
