import Link from "next/link";
import { Form, Field } from "@/components/Form";
import { registerAction } from "@/lib/actions";
import { Factory } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { OAuthButtons } from "@/components/OAuthButtons";

export const metadata = { title: "Регистрация" };

export default function Register() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="mb-8 flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-accent text-white"><Factory size={18} /></span><b className="text-lg">Контент-завод</b></div>
      <h1 className="mb-1 text-2xl font-semibold">Создать аккаунт</h1>
      <p className="mb-6 text-sm text-ink2">100 ₽ на баланс в подарок — хватит на пробный контент-план.</p>
      <Form action={registerAction} submit="Создать аккаунт">
        <Field label="Ваше имя"><input name="name" required className="input" /></Field>
        <Field label="Организация / агентство"><input name="org" required className="input" /></Field>
        <Field label="Email"><input name="email" type="email" required autoComplete="username" className="input" /></Field>
        <Field label="Пароль (от 8 символов)"><PasswordInput autoComplete="new-password" minLength={8} /></Field>
      </Form>
      <OAuthButtons verb="Зарегистрироваться" />
      <p className="mt-6 text-sm text-ink2">Уже есть аккаунт? <Link className="text-accent-ink" href="/login">Войти</Link></p>
    </main>
  );
}
