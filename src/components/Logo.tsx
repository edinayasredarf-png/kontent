import Link from "next/link";

/**
 * Две версии логотипа без подложки: с чёрным шрифтом — для светлой темы, с белым — для тёмной.
 * Какая видна, решает CSS (.logo-light / .logo-dark в globals.css) по выбранной теме или по системной.
 * Файлы: /public/logo-light.svg, /public/logo-dark.svg; иконка вкладки — src/app/icon.svg.
 */
export function Logo({ href = "/app", className = "", big, light }: { href?: string; className?: string; big?: boolean; light?: boolean }) {
  return (
    <Link href={href} aria-label="На главную" className={`${big ? "flex justify-center" : "inline-flex items-center"} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-light.svg" alt="Логотип" width={150} height={42} className={`${light ? "!inline " : ""}logo-light w-auto ${big ? "h-auto w-[37%]" : "h-10"}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!light && <img src="/logo-dark.svg" alt="" aria-hidden width={150} height={42} className={`logo-dark w-auto ${big ? "h-auto w-[37%]" : "h-10"}`} />}
    </Link>
  );
}
