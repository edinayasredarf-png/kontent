import { LOGO_POSITIONS, STYLES } from "@/lib/images";

export function MaterialImageFields({ models }: { models: { id: string; label: string }[] }) {
  return <div className="space-y-2">
    <label className="block text-xs text-ink2">Описание картинки
      <textarea name="prompt" rows={2} maxLength={500} placeholder="По умолчанию — по содержанию материала и брендбуку" className="input mt-1 text-xs" />
    </label>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs text-ink2">Формат
        <select name="aspect" className="input mt-1 text-xs"><option value="">По умолчанию</option><option value="square">Квадрат</option><option value="portrait">Вертикальный</option><option value="landscape">Горизонтальный</option></select>
      </label>
      <label className="text-xs text-ink2">Стиль
        <select name="style" className="input mt-1 text-xs"><option value="">По брендбуку</option>{Object.entries(STYLES).map(([id, style]) => <option key={id} value={id}>{style.label}</option>)}</select>
      </label>
      <label className="text-xs text-ink2">Логотип
        <select name="logoPos" className="input mt-1 text-xs">
          <option value="">По брендбуку</option><option value="none">Без логотипа</option>
          {LOGO_POSITIONS.map((pos, i) => <option key={pos} value={pos}>{["Сверху слева", "Сверху по центру", "Сверху справа", "Посередине слева", "По центру", "Посередине справа", "Снизу слева", "Снизу по центру", "Снизу справа"][i]}</option>)}
        </select>
      </label>
      <label className="text-xs text-ink2">Модель
        <select name="model" className="input mt-1 text-xs"><option value="">По умолчанию</option>{models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select>
      </label>
    </div>
  </div>;
}
