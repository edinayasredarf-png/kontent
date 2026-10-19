/** Тумблер в цветах проекта. Это обычный чекбокс (работает в формах без JS-состояния): name/value уходят в форму как у чекбокса. */
export function Switch({ name, value, defaultChecked, label, hint, onChange }: { name: string; value?: string; defaultChecked?: boolean; label: React.ReactNode; hint?: React.ReactNode; onChange?: React.ChangeEventHandler<HTMLInputElement> }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0"><span className="block text-sm font-medium">{label}</span>{hint && <span className="mt-0.5 block text-xs text-ink2">{hint}</span>}</span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} onChange={onChange} className="peer sr-only" />
        <span className="h-7 w-12 rounded-full bg-tile2 transition-colors peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="pointer-events-none absolute left-1 top-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
