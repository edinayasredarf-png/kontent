import { Form, Field } from "@/components/Form";
import { saveBrand } from "@/lib/actions";
import { PageHead } from "@/components/ui";
import { NichePicker } from "@/components/NichePicker";
import { NICHES } from "@/lib/niches";

const PRESETS = Object.entries(NICHES).map(([key, n]) => ({ key, name: n.name, values: { description: n.brand.description, audience: n.brand.audience, tone: n.brand.tone, forbidden: n.brand.forbidden } }));

export default function NewBrand() {
  return (
    <>
      <PageHead title="Новый бренд" sub="Чем точнее профиль, тем меньше правок после генерации." />
      <div className="card max-w-2xl p-6">
        <Form action={saveBrand} submit="Сохранить бренд">
          <NichePicker presets={PRESETS} hint="Подставит описание, аудиторию, тон и запреты для вашей сферы. Название и детали впишите свои." />
          <Field label="Название"><input name="name" required className="input" /></Field>
          <Field label="Чем занимается компания"><textarea name="description" rows={4} className="input" placeholder="Продукт, ценности, чем отличаетесь" /></Field>
          <Field label="Целевая аудитория"><textarea name="audience" rows={2} className="input" /></Field>
          <Field label="Тон общения">
            <select name="tone" className="input"><option value="professional">Профессиональный</option><option value="friendly">Дружелюбный</option><option value="humor">Юмористический</option><option value="serious">Серьёзный</option><option value="inspiring">Вдохновляющий</option></select>
          </Field>
          <Field label="Что нельзя упоминать (через запятую)"><input name="forbidden" className="input" /></Field>
          <Field label="Конкуренты (не упоминать)"><input name="competitors" className="input" /></Field>
        </Form>
      </div>
    </>
  );
}
