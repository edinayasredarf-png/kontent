"use client";
import Link from "next/link";
import { useEffect, useRef, type ComponentProps } from "react";
import { useRouter } from "next/navigation";

/** Prefetch the requested destination on intent, rather than rendering every dynamic menu page in the background. */
export function NavLink({ onMouseEnter, onMouseLeave, onFocus, ...props }: ComponentProps<typeof Link>) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), last = useRef(0);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const warm = () => {
    if (typeof props.href !== "string" || Date.now() - last.current < 30_000) return;
    last.current = Date.now();
    router.prefetch(props.href);
  };
  return <Link {...props} prefetch={false}
    onMouseEnter={(event) => { onMouseEnter?.(event); timer.current = setTimeout(warm, 100); }}
    onMouseLeave={(event) => { onMouseLeave?.(event); if (timer.current) clearTimeout(timer.current); }}
    onFocus={(event) => { onFocus?.(event); warm(); }} />;
}
