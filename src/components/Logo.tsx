import Link from "next/link";

/**
 * Две версии логотипа без подложки: с чёрным шрифтом — для светлой темы, с белым — для тёмной.
 * Какая видна, решает CSS (.logo-light / .logo-dark в globals.css) по выбранной теме или по системной.
 * Файлы: /public/logo-light.svg, /public/logo-dark.svg; иконка вкладки — src/app/icon.svg.
 */
export function Logo({ href = "/app", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label="На главную" className={`inline-flex items-center ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-light.svg" alt="Логотип" width={150} height={42} className="logo-light h-10 w-auto" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-dark.svg" alt="" aria-hidden width={150} height={42} className="logo-dark h-10 w-auto" />
    </Link>
  );
}
