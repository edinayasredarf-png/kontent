"use client";

import { useState } from "react";

export function FactoryBrandPicker({ brands }: { brands: { id: string; name: string }[] }) {
  const [choice, setChoice] = useState(brands[0]?.id ?? "new");
  return <div className="space-y-3">
    <label className="block">
      <span className="label">Бренд</span>
      <select name="brand_id" value={choice} onChange={event => setChoice(event.target.value)} className="input">
        {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        <option value="new">Создать новый бренд</option>
      </select>
    </label>
    {choice === "new" && <label className="block">
      <span className="label">Название нового бренда</span>
      <input name="new_brand_name" required maxLength={120} className="input" />
    </label>}
  </div>;
}
