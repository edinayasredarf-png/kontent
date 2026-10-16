/** Карточка поста в общем стиле (как в «Новостях»): плитка со светлой шапкой — значок, название, подпись, дата; ниже содержимое и кнопки. */
export function PostCard({ icon, title, sub, subHref, when, children, actions, className = "" }: {
  icon: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; subHref?: string; when?: React.ReactNode;
  children?: React.ReactNode; actions?: React.ReactNode; className?: string;
}) {
  return (
    <article className={`rounded-3xl bg-tile p-2.5 [&_.input]:bg-surface ${className}`}>
      <header className="flex items-center gap-3 rounded-2xl bg-accent-soft px-3 py-2.5">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5">{title}</p>
          {sub != null && (subHref ? <a href={subHref} target="_blank" rel="noreferrer noopener" className="block truncate text-xs leading-4 text-ink2 hover:text-accent-ink">{sub}</a> : <p className="truncate text-xs leading-4 text-ink2">{sub}</p>)}
        </div>
        {when != null && <span className="shrink-0 self-start pt-0.5 text-xs text-ink3">{when}</span>}
      </header>
      {children != null && <div className="px-2.5 pb-1 pt-3">{children}</div>}
      {actions && <div className="mt-2 flex flex-wrap items-center gap-2 px-2.5 pb-2 pt-2">{actions}</div>}
    </article>
  );
}

/** Круглый значок с буквой или иконкой для карточек без источника-аватара. */
export function RoundIcon({ children, tone = "bg-accent text-white" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${tone}`} aria-hidden>{children}</span>;
}
