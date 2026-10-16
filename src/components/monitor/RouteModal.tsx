"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Modal } from "@/components/ui/Modal";

/** Окно, открытое перехватом маршрута: закрытие возвращает на предыдущую страницу. */
export function RouteModal({ title, children, backHref = "/app/monitor" }: { title: string; children: React.ReactNode; backHref?: string }) {
  const router = useRouter();
  const close = useCallback(() => { if (window.history.length > 1) router.back(); else router.push(backHref); }, [router, backHref]);
  return <Modal title={title} onClose={close} wide>{children}</Modal>;
}
