export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка завода" className="space-y-4">
      <div className="flex items-center justify-between"><div className="space-y-2"><div className="skeleton h-8 w-56" /><div className="skeleton h-4 w-32" /></div><div className="skeleton h-10 w-28" /></div>
      <div className="skeleton h-28" /><div className="skeleton h-14" /><div className="skeleton h-14" />
      <div className="skeleton h-56" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16" />)}
    </div>
  );
}
