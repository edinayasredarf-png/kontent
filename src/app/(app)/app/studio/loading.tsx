export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка ассистентов" className="space-y-5">
      <div className="space-y-2"><div className="skeleton h-8 w-52" /><div className="skeleton h-4 w-96 max-w-full" /></div>
      <div className="flex flex-wrap gap-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-8 w-24 !rounded-full" />)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-40" />)}</div>
    </div>
  );
}
