import { requireAdmin } from "@/lib/admin";
import { one } from "@/lib/db";
import { mailState } from "@/lib/mail";
import { clearMailAction, saveMailAction, testMailAction } from "@/lib/admin-mail-actions";
import { AdminNav } from "@/components/AdminNav";
import { Form, Field } from "@/components/Form";
import { PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function MailSettings() {
  const c = await requireAdmin();
  const st = await mailState();
  const saved = await one<{ value: { host?: string; port?: number; secure?: boolean; user?: string; from?: string } }>("select value from kz_platform_settings where key='mail'").catch(() => null);
  const v = saved?.value ?? {};
  return (
    <>
      <PageHead title="Почта" sub="Через неё уходят письма: сброс пароля, приглашения в команду, гостевые ссылки, тестовые рассылки." />
      <AdminNav active="/app/admin/mail" />
      <div className="mx-auto w-full max-w-[640px] space-y-6">
        <section className="card p-5">
          <div className={`mb-4 rounded-xl px-3 py-2 text-sm ${st.configured ? "bg-good-soft text-good" : "bg-warn-soft text-warn"}`}>
            {st.configured ? `Почта работает: ${st.host}, отправитель ${st.from}${st.source === "env" ? " (взято из переменных сервера; сохранённые здесь настройки будут важнее)" : ""}` : "Почта не настроена, письма не отправляются."}
          </div>
          <Form action={saveMailAction} submit="Сохранить">
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Field label="SMTP-сервер"><input name="host" required defaultValue={v.host ?? ""} placeholder="smtp.yandex.ru" className="input" /></Field>
              <Field label="Порт"><input name="port" required inputMode="numeric" defaultValue={String(v.port ?? 465)} className="input" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="secure" defaultChecked={v.secure ?? true} /> Защищённое соединение (SSL, обычно для порта 465)</label>
            <Field label="Логин"><input name="user" required defaultValue={v.user ?? ""} placeholder="info@вашдомен.ru" autoComplete="off" className="input" /></Field>
            <Field label="Пароль"><input name="pass" type="password" autoComplete="new-password" placeholder={saved ? "оставьте пустым, чтобы не менять" : "пароль приложения"} className="input" /></Field>
            <Field label="Адрес отправителя (необязательно)"><input name="from" defaultValue={v.from ?? ""} placeholder='juicer.ai <info@вашдомен.ru>' className="input" /></Field>
            <p className="text-xs text-ink3">Пароль хранится в базе в зашифрованном виде и не показывается. Для Яндекса, Mail.ru и Gmail нужен «пароль приложения», создаётся в настройках безопасности почты. Отправитель должен совпадать с логином, иначе письма не примут.</p>
          </Form>
        </section>
        <section className="card p-5">
          <b className="mb-3 block text-sm">Проверка</b>
          <Form action={testMailAction} submit="Отправить тестовое письмо" variant="ghost">
            <Field label="Куда отправить"><input name="to" type="email" defaultValue={c.user.email} className="input" /></Field>
          </Form>
        </section>
        {saved && (
          <form action={clearMailAction} className="text-center">
            <SubmitButton data-confirm="Удалить сохранённые настройки почты? Останутся только переменные сервера, если они есть." data-confirm-ok="Удалить" className="text-xs text-ink3 hover:text-bad">Удалить сохранённые настройки</SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}
