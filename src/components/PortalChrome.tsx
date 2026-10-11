import type { Portal } from "@/lib/share";
import { cleanKit } from "@/lib/images";

/** Шапка клиентского портала и отчёта: логотип и имя бренда клиента, при белой метке — имя агентства. Платформу не упоминаем, если включено скрытие. */
export function PortalHeader({ p, token, eyebrow, right }: { p: Portal; token: string; eyebrow: string; right?: React.ReactNode }) {
  const accent = cleanKit(p.brand.kit).colors?.[0]?.hex ?? "#029cda";
  return (
    <header className="border-b border-line" style={{ borderTop: `4px solid ${accent}` }}>
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-6">
        {p.brand.logoId && (// eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/share/${token}/asset/${p.brand.logoId}`} alt="" className="h-12 w-auto max-w-[9rem] rounded-lg object-contain" />)}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-ink3">{eyebrow}</p>
          <h1 className="truncate text-2xl font-bold">{p.brand.name}</h1>
        </div>
        {right}
      </div>
    </header>
  );
}

export function PortalFooter({ p }: { p: Portal }) {
  const by = p.wl.name.trim();
  return (
    <footer className="mx-auto max-w-3xl space-y-1 px-5 pb-10 text-xs text-ink3">
      {by && <p>Подготовлено: {by}</p>}
      {p.wl.footer.trim() && <p className="whitespace-pre-wrap">{p.wl.footer}</p>}
      <p>Страница доступна только по этой ссылке. Если вы получили её по ошибке, просто закройте вкладку.</p>
      {!p.wl.hide && <p>Платформа «Контент-завод».</p>}
    </footer>
  );
}
