/** Скелетон страницы: показывается при переходах, пока сервер готовит данные. Шапка и меню остаются на месте. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка страницы" className="space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28" />)}</div>
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}
