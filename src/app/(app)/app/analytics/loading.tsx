export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка аналитики" className="space-y-5">
      <div className="space-y-2"><div className="skeleton h-8 w-40" /><div className="skeleton h-4 w-72" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      <div className="skeleton h-24" />
      <div className="grid gap-4 lg:grid-cols-2"><div className="skeleton h-48" /><div className="skeleton h-48" /></div>
      <div className="skeleton h-40" />
    </div>
  );
}
