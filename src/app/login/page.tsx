import Link from "next/link";
import { Form, Field } from "@/components/Form";
import { loginAction } from "@/lib/actions";
import { PasswordInput } from "@/components/PasswordInput";
import { OAuthButtons } from "@/components/OAuthButtons";
import { safeNext } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";

const ERRORS: Record<string, string> = {
  denied: "Вход отменён на стороне провайдера",
  state: "Сессия входа устарела. Попробуйте ещё раз",
  failed: "Не удалось войти через провайдера. Попробуйте ещё раз или войдите по паролю",
  provider: "Этот способ входа недоступен",
  not_configured: "Вход через этого провайдера пока не настроен",
};


export const metadata = { title: "Вход" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; reset?: string }> }) {
  const { error, next, reset } = await searchParams;
  const nx = safeNext(next);
  return (
    <AuthShell>
      <h1 className="mb-6 text-2xl font-semibold">Вход</h1>
      {reset === "1" && <p className="mb-4 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">Пароль изменён. Войдите с новым паролем.</p>}
      {error && ERRORS[error] && <p className="mb-4 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{ERRORS[error]}</p>}
      <Form action={loginAction} submit="Войти" wide>
        <input type="hidden" name="next" value={nx} />
        <Field label="Email"><input name="email" type="email" required autoComplete="username" className="input" /></Field>
        <Field label="Пароль"><PasswordInput autoComplete="current-password" /></Field>
        <div className="-mt-2 text-right"><Link className="text-xs text-accent-ink" href="/forgot">Забыли пароль?</Link></div>
      </Form>
      <OAuthButtons verb="Войти" next={nx} />
      <p className="mt-6 text-sm text-ink2">Нет аккаунта? <Link className="text-accent-ink" href={nx === "/app" ? "/register" : `/register?next=${encodeURIComponent(nx)}`}>Зарегистрироваться</Link></p>
    </AuthShell>
  );
}
