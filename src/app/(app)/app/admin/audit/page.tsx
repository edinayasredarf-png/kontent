import { listAudit, requireAdmin } from "@/lib/admin";
import { AdminNav } from "@/components/AdminNav";
import { PageHead } from "@/components/ui";

const LABEL: Record<string, string> = {
  "balance.adjust": "Изменение баланса", "org.plan": "Смена тарифа", "org.suspend": "Приостановка организации", "org.resume": "Возобновление организации",
  "user.disable": "Блокировка пользователя", "user.enable": "Разблокировка пользователя", "user.logout_all": "Закрытие всех сессий", "user.reset_link": "Выдача ссылки сброса пароля",
};

export default async function AuditPage() {
  await requireAdmin();
  const rows = await listAudit(150);
  return (
    <>
      <PageHead title="Журнал действий" sub="Последние 150 действий администраторов платформы." />
      <AdminNav active="/app/admin/audit" />
      <div className="card overflow-x-auto">
        {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink2">Действий ещё не было.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex min-w-[560px] flex-wrap items-start gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0">
            <span className="w-36 shrink-0 text-xs text-ink3">{new Date(r.at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <span className="min-w-0 flex-1"><b>{LABEL[r.action] ?? r.action}</b> <span className="text-xs text-ink3">{r.target_type} {r.target_id.slice(0, 8)}</span>{Object.keys(r.details).length > 0 && <span className="ml-2 text-xs text-ink2">{JSON.stringify(r.details)}</span>}</span>
            <span className="text-xs text-ink2">{r.actor_email}</span>
          </div>))}
      </div>
    </>
  );
}
