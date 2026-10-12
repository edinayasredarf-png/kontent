"use client";

/** Чип канала в настройках завода: выбор сохраняется сразу, без отдельной кнопки «Сохранить». */
export function ChannelChip({ id, on, label }: { id: string; on: boolean; label: string }) {
  return (
    <label className="chip cursor-pointer !px-3 !py-1.5 chip-toggle">
      <input type="checkbox" name="channels" value={id} defaultChecked={on} className="hidden" onChange={(e) => e.currentTarget.form?.requestSubmit()} />{label}
    </label>
  );
}
