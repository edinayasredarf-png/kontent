import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { Form, Field } from "@/components/Form";
import { saveFactory } from "@/lib/actions";
import { PageHead, KIND } from "@/components/ui";

const DAYS = [["1", "Пн"], ["2", "Вт"], ["3", "Ср"], ["4", "Чт"], ["5", "Пт"], ["6", "Сб"], ["0", "Вс"]];

export default async function NewFactory() {
  const c = await requireCtx();
  const brands = await q<{ id: string; name: string }>("select id,name from brands where org_id=$1 order by name", [c.org.id]);
  if (!brands.length) return (
    <><PageHead title="Новый завод" /><div className="card p-6 text-sm">Сначала создайте бренд. <Link className="text-accent-ink" href="/app/brands/new">Добавить бренд →</Link></div></>
  );
  return (
    <>
      <PageHead title="Новый завод" sub="Один завод — один продукт или направление. Не смешивайте темы." />
      <div className="card max-w-2xl p-6">
        <Form action={saveFactory} submit="Создать завод">
          <Field label="Бренд"><select name="brand_id" className="input">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Название завода"><input name="name" required className="input" placeholder="Например: Блог про закупки" /></Field>
          <Field label="Ниша"><input name="niche" className="input" /></Field>
          <Field label="Продукт / направление"><textarea name="product" rows={3} className="input" /></Field>
          <div><span className="label">Форматы</span><div className="flex flex-wrap gap-2">
            {["post", "carousel", "article", "reels"].map((k, i) => (
              <label key={k} className="chip cursor-pointer !px-3 !py-1.5 has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink"><input type="checkbox" name="formats" value={k} defaultChecked={i === 0} className="hidden" />{KIND[k]}</label>
            ))}</div></div>
          <div><span className="label">Дни публикации</span><div className="flex flex-wrap gap-2">
            {DAYS.map(([v, l]) => (
              <label key={v} className="chip cursor-pointer !px-3 !py-1.5 has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink"><input type="checkbox" name="days" value={v} defaultChecked={v !== "0" && v !== "6"} className="hidden" />{l}</label>
            ))}</div></div>
          <Field label="Время публикации (МСК, через запятую)"><input name="times" defaultValue="10:00" className="input" /></Field>
          <Field label="Одобрение"><select name="approval" className="input"><option value="manual">Вручную — каждую идею подтверждаю я</option><option value="auto">Автоматически</option></select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autopublish" /> Публиковать автоматически</label>
        </Form>
      </div>
    </>
  );
}
