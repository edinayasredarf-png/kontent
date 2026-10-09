import { LogOut } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { Form, Field } from "@/components/Form";
import { PasswordInput } from "@/components/PasswordInput";
import { changeEmailAction, changePasswordAction, logoutEverywhereAction, updateNameAction } from "@/lib/account-actions";
import { PageHead } from "@/components/ui";

export default async function Profile() {
  const c = await requireCtx();
  return (
    <>
      <PageHead title="Профиль и безопасность" sub={c.user.email} />
      <div className="grid max-w-3xl gap-6">
        <section className="card p-6">
          <b className="mb-4 block text-sm">Имя</b>
          <Form action={updateNameAction} submit="Сохранить"><Field label="Как к вам обращаться"><input name="name" defaultValue={c.user.name} required minLength={2} maxLength={80} className="input" /></Field></Form>
        </section>
        <section className="card p-6">
          <b className="mb-4 block text-sm">Email</b>
          <Form action={changeEmailAction} submit="Изменить email">
            <Field label="Новый email"><input name="email" type="email" required defaultValue={c.user.email} autoComplete="email" className="input" /></Field>
            <Field label="Текущий пароль (для подтверждения)"><PasswordInput name="password" autoComplete="current-password" /></Field>
          </Form>
        </section>
        <section className="card p-6">
          <b className="mb-1 block text-sm">Пароль</b>
          {!c.user.hasPassword && <p className="mb-3 text-xs text-ink2">Вы вошли через Яндекс или VK, пароля у аккаунта пока нет. Задайте его, чтобы входить и по почте.</p>}
          <Form action={changePasswordAction} submit={c.user.hasPassword ? "Сменить пароль" : "Задать пароль"}>
            {c.user.hasPassword && <Field label="Текущий пароль"><PasswordInput name="current" autoComplete="current-password" /></Field>}
            <Field label="Новый пароль (от 8 символов)"><PasswordInput name="next" autoComplete="new-password" minLength={8} /></Field>
            <Field label="Повторите новый пароль"><PasswordInput name="confirm" autoComplete="new-password" minLength={8} /></Field>
          </Form>
        </section>
        <section className="card p-6">
          <b className="mb-1 block text-sm">Сессии</b>
          <p className="mb-3 text-xs text-ink2">Выйдет из аккаунта на всех устройствах, включая это. Пригодится, если потеряли телефон или вошли с чужого компьютера.</p>
          <form action={logoutEverywhereAction}><button className="btn btn-danger"><LogOut size={15} />Выйти везде</button></form>
        </section>
      </div>
    </>
  );
}
