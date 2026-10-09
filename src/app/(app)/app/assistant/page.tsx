import { Rocket } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { Form, Field } from "@/components/Form";
import { LiaChat } from "@/components/LiaChat";
import { quickLaunchAction } from "@/lib/lia-actions";
import { PageHead } from "@/components/ui";

export const maxDuration = 90;

export default async function Assistant() {
  const c = await requireCtx();
  return (
    <>
      <PageHead title="Лия" sub="Помощница: отвечает на вопросы по платформе и запускает завод по описанию бизнеса." />
      <div className="grid gap-6 lg:grid-cols-2">
        <LiaChat free={c.org.unlimited} />
        <section className="card h-fit p-5">
          <b className="mb-1 flex items-center gap-2 text-sm"><Rocket size={16} className="text-accent" />Быстрый запуск</b>
          <p className="mb-4 text-xs text-ink2">Опишите бизнес своими словами — Лия заполнит профиль бренда и создаст первый завод. Всё можно потом поправить. {c.org.unlimited ? "Бесплатно для админа." : "Стоит 6 ₽, при ошибке деньги возвращаются."}</p>
          <Form action={quickLaunchAction} submit="Создать бренд и завод">
            <Field label="Расскажите о бизнесе"><textarea name="description" required minLength={20} maxLength={3000} rows={7} className="input" placeholder="Мы делаем… Наши клиенты… Хотим писать про… Нельзя упоминать…" /></Field>
          </Form>
        </section>
      </div>
    </>
  );
}
