import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { KIND_LABEL, listNotifications } from "@/lib/notify";
import { markAllNotificationsAction } from "@/lib/notify-actions";
import { PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Уведомления" };
const when = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export default async function Notifications() {
  const c = await requireCtx();
  if (c.user.guest) redirect("/app/overview");
  const items = await listNotifications(c.user.id, 100);
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <>
      <PageHead title="Уведомления" sub="Публикации, ошибки, новости по вашим ключевым словам, ответы поддержки, баланс." action={unread ? <form action={markAllNotificationsAction}><SubmitButton className="btn btn-ghost">Прочитать все ({unread})</SubmitButton></form> : undefined} />
      <div className="w-full max-w-[720px]">
        <div className="card">
          {items.length === 0 && <p className="px-5 py-6 text-sm text-ink3">Пока уведомлений нет.</p>}
          {items.map((n) => {
            const inner = <><span className="min-w-0 flex-1"><b className="block text-sm font-medium">{!n.read_at && <span className="mr-2 inline-block size-2 rounded-full bg-accent align-middle" />}{n.title}</b>{n.body && <span className="mt-0.5 block text-xs text-ink2">{n.body}</span>}<span className="mt-0.5 block text-[11px] text-ink3">{KIND_LABEL[n.kind] ?? n.kind} · {when(n.created_at)}</span></span></>;
            return n.href ? <Link key={n.id} href={n.href} className="flex border-b border-line px-5 py-3 last:border-0 hover:bg-accent-soft/50">{inner}</Link> : <div key={n.id} className="flex border-b border-line px-5 py-3 last:border-0">{inner}</div>;
          })}
        </div>
      </div>
    </>
  );
}
