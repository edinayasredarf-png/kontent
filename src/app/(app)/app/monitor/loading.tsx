export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка ленты" className="space-y-4">
      <div className="flex items-center justify-between"><div className="space-y-2"><div className="skeleton h-8 w-48" /><div className="skeleton h-4 w-80 max-w-full" /></div><div className="flex gap-2"><div className="skeleton h-10 w-28" /><div className="skeleton h-10 w-40" /></div></div>
      <div className="skeleton h-16" /><div className="skeleton h-14" />
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-32" />)}
    </div>
  );
}
