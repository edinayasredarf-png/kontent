"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function DraftProgress({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const busy = useRef(pending);
  busy.current = pending;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (!document.hidden && !busy.current) start(() => router.refresh());
    }, 4000);
    return () => clearInterval(timer);
  }, [active, router]);
  if (!active) return null;
  return <p role="status" className="flex items-center gap-2 text-xs text-ink2"><Loader2 size={14} className="animate-spin" />Создаём материал. Текст и изображения появятся автоматически.</p>;
}
