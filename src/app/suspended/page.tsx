import { Logo } from "@/components/Logo";
import { operator } from "@/lib/legal";
import { logoutAction } from "@/lib/actions";

export const metadata = { title: "Доступ приостановлен" };
export const dynamic = "force-dynamic";

export default function Suspended() {
  const o = operator();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="mb-10"><Logo big href="/login" /></div>
      <h1 className="mb-2 text-2xl font-semibold">Доступ приостановлен</h1>
      <p className="mb-6 text-sm text-ink2">Работа вашей организации приостановлена администратором платформы. Ваши данные сохранены.{o.email ? <> Свяжитесь с нами: <b>{o.email}</b>.</> : " Свяжитесь с администратором платформы."}</p>
      <form action={logoutAction}><button className="btn btn-ghost">Выйти</button></form>
    </main>
  );
}
