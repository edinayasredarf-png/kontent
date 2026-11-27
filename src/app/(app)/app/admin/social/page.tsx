import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { socialAppConfig, socialRedirectUri } from "@/lib/social-oauth-config";
import { APP_DETAILS, APP_FAMILIES } from "@/lib/social-oauth-catalog";
import { saveSocialAppAction } from "@/lib/admin-social-actions";
import { AdminNav } from "@/components/AdminNav";
import { Form, Field } from "@/components/Form";
import { PageHead } from "@/components/ui";
export const dynamic = "force-dynamic";
export default async function SocialApps() {
  await requireAdmin();
  const apps = await Promise.all(APP_FAMILIES.map(async family => ({ family, details: APP_DETAILS[family], config: await socialAppConfig(family) })));
  return <><PageHead title="Подключение соцсетей" sub="Приложения JuicerAI: настройте один раз, затем пользователи подключают аккаунты кнопкой авторизации." /><AdminNav active="/app/admin/social" />
    <div className="max-w-3xl space-y-6"><p className="rounded-2xl bg-tile p-4 text-sm text-ink2">Зарегистрируйте собственные приложения. Client ID и Redirect URL SMMplanner относятся к его сервису и не подходят для JuicerAI. Секреты вводятся только здесь, шифруются в базе и не показываются после сохранения. Пустой Client Secret сохраняет прежнее значение, если ID приложения не изменился.</p>
      {apps.map(({ family, details, config }) => <section key={family} className="card space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{details.name}</h2><span className={`chip ${config ? "text-good" : "text-warn"}`}>{config ? "Параметры заданы · доступы проверить в кабинете площадки" : "Нужно зарегистрировать приложение"}</span></div>
        <Link href={details.register} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">Открыть страницу разработчика ↗</Link>
        <div className="rounded-xl bg-tile p-3 text-sm"><b>Redirect URL — добавьте в кабинете площадки:</b>{details.providers.map(p => <code key={p} className="mt-2 block break-all select-all">{socialRedirectUri(p)}</code>)}</div><p className="text-xs text-ink2">Права: {details.scopes}</p>
        <Form action={saveSocialAppAction} submit="Сохранить параметры"><input type="hidden" name="family" value={family} /><Field label="Client ID собственного приложения"><input className="input" name="client_id" required defaultValue={config?.id || ""} inputMode="numeric" autoComplete="off" /></Field>{family === "ok" && <Field label="Application Key (публичный ключ приложения ОК)"><input className="input" name="application_key" required defaultValue={config?.applicationKey || ""} autoComplete="off" /></Field>}<Field label="Client Secret"><input className="input" name="client_secret" type="password" autoComplete="new-password" placeholder={config ? "Оставьте пустым, чтобы не менять" : "Секрет собственного приложения"} /></Field></Form>
      </section>)}
      <section className="card space-y-3 p-5"><h2 className="text-lg font-semibold">TenChat · партнёрский доступ</h2><p className="text-sm text-ink2">Ссылка входа SMMplanner подтверждает отдельную партнёрскую интеграцию. Для JuicerAI нужно получить у TenChat собственный Client ID, Client Secret и документацию обмена кода, обновления токенов, получения профиля и публикации с изображениями. Пока этот контракт не предоставлен, прямое подключение TenChat не включено.</p></section>
    </div></>;
}
