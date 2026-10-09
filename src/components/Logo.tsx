import Link from "next/link";

/**
 * Логотип нарисован белым шрифтом, поэтому всегда стоит на тёмной подложке: на белом интерфейсе надпись была бы не видна.
 * Файл — /public/logo.svg (исходник без изменений), иконка для вкладки браузера — src/app/icon.svg.
 */
export function Logo({ href = "/app", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label="На главную" className={`inline-flex items-center rounded-2xl bg-[#0f1113] px-4 py-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="Логотип" width={130} height={36} className="h-9 w-auto" />
    </Link>
  );
}
