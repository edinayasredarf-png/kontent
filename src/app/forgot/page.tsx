import Link from "next/link";
import { Form, Field } from "@/components/Form";
import { LegalLinks } from "@/components/LegalLinks";
import { Logo } from "@/components/Logo";
import { forgotAction } from "@/lib/actions";
import { mailConfigured } from "@/lib/mail";

export const metadata = { title: "Восстановление пароля" };
export const dynamic = "force-dynamic";

export default function Forgot() {
  const mail = mailConfigured();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="mb-8"><Logo href="/login" /></div>
      <h1 className="mb-1 text-2xl font-semibold">Восстановление пароля</h1>
      <p className="mb-6 text-sm text-ink2">Укажите email аккаунта — отправим ссылку для создания нового пароля.</p>
      {mail ? (
        <Form action={forgotAction} submit="Отправить ссылку"><Field label="Email"><input name="email" type="email" required autoComplete="email" className="input" /></Field></Form>
      ) : (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Отправка писем пока не настроена. Напишите администратору платформы — он выдаст ссылку для сброса пароля.</p>
      )}
      <p className="mt-6 text-sm text-ink2"><Link className="text-accent-ink" href="/login">← Вернуться ко входу</Link></p>
      <LegalLinks className="mt-8" />
    </main>
  );
}
