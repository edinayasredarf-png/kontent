"use client";
import { useState } from "react";

const OPTS = [
  ["telegram", "Telegram-канал", "@name или t.me/name"],
  ["vk", "Сообщество VK", "vk.com/name"],
  ["site", "Сайт", "example.ru или адрес страницы с новостями"],
] as const;

/** Выбор площадки и ссылка: подсказка в поле меняется вместе с типом. */
export function PlatformPicker({ label = "Площадка" }: { label?: string }) {
  const [kind, setKind] = useState<(typeof OPTS)[number][0]>("telegram");
  const ph = OPTS.find((o) => o[0] === kind)![2];
  return (
    <div className="space-y-3">
      <div><label className="label">{label}</label><select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="input">{OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div><label className="label">Ссылка или имя</label><input name="input" required placeholder={ph} className="input" /></div>
    </div>
  );
}
