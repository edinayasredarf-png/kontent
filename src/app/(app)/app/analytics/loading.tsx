export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка аналитики">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-10 w-60" />
      </div>
      <div className="rounded-[20px] border border-line">
        <div className="flex gap-3 border-b border-line p-4 sm:px-6">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-10 min-w-0 flex-1" />)}
        </div>
        <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_25%]">
          <div className="skeleton h-56 sm:h-64" />
          <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-8" />)}</div>
        </div>
      </div>
    </div>
  );
}
