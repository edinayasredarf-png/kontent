import Link from "next/link";
import { Form, Field } from "@/components/Form";
import { loginAction } from "@/lib/actions";
import { Factory } from "lucide-react";

export const metadata = { title: "Вход" };

export default function Login() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="mb-8 flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-accent text-white"><Factory size={18} /></span><b className="text-lg">Контент-завод</b></div>
      <h1 className="mb-1 text-2xl font-semibold">Вход</h1>
      <p className="mb-6 text-sm text-ink2">Единая среда</p>
      <Form action={loginAction} submit="Войти">
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className="input" /></Field>
        <Field label="Пароль"><input name="password" type="password" required autoComplete="current-password" className="input" /></Field>
      </Form>
      <p className="mt-6 text-sm text-ink2">Нет аккаунта? <Link className="text-accent-ink" href="/register">Зарегистрироваться</Link></p>
    </main>
  );
}
