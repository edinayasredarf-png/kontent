import Link from "next/link";
import { Form, Field } from "@/components/Form";
import { registerAction } from "@/lib/actions";
import { Logo } from "@/components/Logo";
import { PasswordInput } from "@/components/PasswordInput";
import { OAuthButtons } from "@/components/OAuthButtons";
import { safeNext } from "@/lib/auth";
import { LegalLinks } from "@/components/LegalLinks";

export const metadata = { title: "Регистрация" };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nx = safeNext((await searchParams).next);
  return (
    <main className="flex min-h-screen flex-col px-5">
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
      <div className="mb-8"><Logo href="/register" /></div>
      <h1 className="mb-1 text-2xl font-semibold">Создать аккаунт</h1>
      <p className="mb-6 text-sm text-ink2">100 ₽ на баланс в подарок — хватит на пробный контент-план.</p>
      <Form action={registerAction} submit="Создать аккаунт" wide>
        <input type="hidden" name="next" value={nx} />
        <Field label="Ваше имя"><input name="name" required className="input" /></Field>
        <Field label="Организация / агентство"><input name="org" required className="input" /></Field>
        <Field label="Email"><input name="email" type="email" required autoComplete="username" className="input" /></Field>
        <Field label="Пароль (от 8 символов)"><PasswordInput autoComplete="new-password" minLength={8} /></Field>
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink2"><input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0" /><span>Я принимаю <Link href="/legal/terms" target="_blank" className="text-accent-ink underline">пользовательское соглашение</Link> и даю согласие на обработку персональных данных согласно <Link href="/legal/privacy" target="_blank" className="text-accent-ink underline">политике конфиденциальности</Link></span></label>
      </Form>
      <OAuthButtons verb="Зарегистрироваться" next={nx} />
      <p className="mt-4 text-xs text-ink3">Регистрируясь через Яндекс ID или VK ID, вы принимаете те же условия.</p>
      <p className="mt-6 text-sm text-ink2">Уже есть аккаунт? <Link className="text-accent-ink" href={nx === "/app" ? "/login" : `/login?next=${encodeURIComponent(nx)}`}>Войти</Link></p>
    </div>
    <footer className="pb-5 pt-2"><LegalLinks className="justify-center" /></footer>
    </main>
  );
}
