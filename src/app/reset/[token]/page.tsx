import Link from "next/link";
import { Form, Field } from "@/components/Form";
import { LegalLinks } from "@/components/LegalLinks";
import { Logo } from "@/components/Logo";
import { PasswordInput } from "@/components/PasswordInput";
import { resetAction } from "@/lib/actions";
import { resetInfo } from "@/lib/reset";

export const metadata = { title: "Новый пароль" };
export const dynamic = "force-dynamic";

export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await resetInfo(token);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="mb-8"><Logo href="/login" /></div>
      {info ? (
        <>
          <h1 className="mb-1 text-2xl font-semibold">Новый пароль</h1>
          <p className="mb-6 text-sm text-ink2">Для {info.email}. После смены вы выйдете со всех устройств.</p>
          <Form action={resetAction} submit="Сохранить пароль">
            <input type="hidden" name="token" value={token} />
            <Field label="Новый пароль (от 8 символов)"><PasswordInput name="password" autoComplete="new-password" minLength={8} /></Field>
            <Field label="Повторите пароль"><PasswordInput name="confirm" autoComplete="new-password" minLength={8} /></Field>
          </Form>
        </>
      ) : (
        <>
          <h1 className="mb-2 text-2xl font-semibold">Ссылка недействительна</h1>
          <p className="mb-6 text-sm text-ink2">Она уже использована или истекла (ссылки живут 60 минут). Запросите сброс заново.</p>
          <Link href="/forgot" className="btn w-fit">Запросить новую ссылку</Link>
        </>
      )}
      <LegalLinks className="mt-8" />
    </main>
  );
}
