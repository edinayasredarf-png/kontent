import Link from "next/link";
import { Form, Field } from "@/components/Form";
import { loginAction } from "@/lib/actions";
import { Factory } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { OAuthButtons } from "@/components/OAuthButtons";
import { safeNext } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  denied: "Вход отменён на стороне провайдера",
  state: "Сессия входа устарела. Попробуйте ещё раз",
  failed: "Не удалось войти через провайдера. Попробуйте ещё раз или войдите по паролю",
  provider: "Этот способ входа недоступен",
  not_configured: "Вход через этого провайдера пока не настроен",
};


export const metadata = { title: "Вход" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const nx = safeNext(next);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="mb-8 flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-accent text-white"><Factory size={18} /></span><b className="text-lg">Контент-завод</b></div>
      <h1 className="mb-1 text-2xl font-semibold">Вход</h1>
      <p className="mb-6 text-sm text-ink2">Единая среда</p>
      {error && ERRORS[error] && <p className="mb-4 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{ERRORS[error]}</p>}
      <Form action={loginAction} submit="Войти">
        <input type="hidden" name="next" value={nx} />
        <Field label="Email"><input name="email" type="email" required autoComplete="username" className="input" /></Field>
        <Field label="Пароль"><PasswordInput autoComplete="current-password" /></Field>
      </Form>
      <OAuthButtons verb="Войти" next={nx} />
      <p className="mt-6 text-sm text-ink2">Нет аккаунта? <Link className="text-accent-ink" href={nx === "/app" ? "/register" : `/register?next=${encodeURIComponent(nx)}`}>Зарегистрироваться</Link></p>
    </main>
  );
}
