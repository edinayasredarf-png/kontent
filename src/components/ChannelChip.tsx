"use client";

/** Чип канала в настройках завода: выбор сохраняется сразу, без отдельной кнопки «Сохранить». */
export function ChannelChip({ id, on, label, auto = true }: { id: string; on: boolean; label: string; auto?: boolean }) {
  return (
    <label className="chip cursor-pointer !px-3 !py-1.5 chip-toggle">
      <input type="checkbox" name="channels" value={id} defaultChecked={on} className="hidden" onChange={auto ? (e) => e.currentTarget.form?.requestSubmit() : undefined} />{label}
    </label>
  );
}
