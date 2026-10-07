import { Form, Field } from "@/components/Form";
import { saveBrand } from "@/lib/actions";
import { PageHead } from "@/components/ui";

export default function NewBrand() {
  return (
    <>
      <PageHead title="Новый бренд" sub="Чем точнее профиль, тем меньше правок после генерации." />
      <div className="card max-w-2xl p-6">
        <Form action={saveBrand} submit="Сохранить бренд">
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
