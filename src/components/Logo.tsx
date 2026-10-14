import Link from "next/link";

/**
 * Две версии логотипа без подложки: с тёмным шрифтом — для светлой темы, с белым — для тёмной.
 * Какая видна, решает CSS (.logo-light / .logo-dark в globals.css) по выбранной теме или по системной.
 * Файлы: /public/logo-main.svg и /public/logo-main-dark.svg; иконка вкладки — src/app/icon.svg.
 */
export function Logo({ href = "/app", className = "", big, light, h }: { href?: string; className?: string; big?: boolean; light?: boolean; h?: number }) {
  const cls = big ? "h-auto w-[37%]" : "";
  const style = !big && h ? { height: h } : undefined;
  return (
    <Link href={href} aria-label="На главную" className={`${big ? "flex justify-center" : "inline-flex items-center"} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-main.svg" alt="Логотип" width={166} height={46} style={style} className={`${light ? "!inline " : ""}logo-light w-auto ${cls || (h ? "" : "h-10")}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!light && <img src="/logo-main-dark.svg" alt="" aria-hidden width={166} height={46} style={style} className={`logo-dark w-auto ${cls || (h ? "" : "h-10")}`} />}
    </Link>
  );
}
