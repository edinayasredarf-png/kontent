import Link from "next/link";

/** Карточка «ничего не нашлось»: иллюстрация, пояснение и кнопка сброса фильтра. */
export function NoResults({ q, filtered }: { q: string; filtered: boolean }) {
  return (
    <div className="feed-card mx-auto flex w-full flex-col items-center rounded-3xl bg-tile px-6 py-12 text-center">
      <svg viewBox="0 0 160 140" width="160" height="140" aria-hidden className="mb-4">
        <circle cx="80" cy="70" r="58" fill="var(--accent-soft)" />
        <rect x="38" y="38" width="62" height="14" rx="7" fill="var(--surface)" />
        <rect x="38" y="60" width="84" height="14" rx="7" fill="var(--surface)" />
        <rect x="38" y="82" width="46" height="14" rx="7" fill="var(--surface)" />
        <g className="nr-lens">
          <circle cx="104" cy="88" r="22" fill="var(--surface)" stroke="var(--accent)" strokeWidth="6" />
          <line x1="120" y1="104" x2="138" y2="122" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" />
          <path d="M96 82c0-6 6-9 11-6 4 3 3 8-2 10-2 1-3 2-3 5" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
          <circle cx="102" cy="99" r="2.6" fill="var(--accent)" />
        </g>
      </svg>
      <b className="text-base">{q ? `По запросу «${q}» ничего не нашлось` : "Ничего не нашлось"}</b>
      <p className="mt-1 max-w-sm text-sm text-ink2">{filtered ? "Попробуйте другое слово, расширьте период или снимите часть фильтров." : "Новых постов пока нет. Нажмите «Обновить» или добавьте источники в «Настройках»."}</p>
      {filtered && <Link href="/app/monitor" className="pill mt-5">Сбросить фильтр</Link>}
    </div>
  );
}
