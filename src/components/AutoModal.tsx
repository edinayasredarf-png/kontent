"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";

/** Окно, которое открыто сразу при загрузке страницы (по параметру адреса). Закрытие убирает параметр. */
export function AutoModal({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <Modal title={title} wide onClose={() => router.replace(closeHref, { scroll: false })}>{children}</Modal>;
}
