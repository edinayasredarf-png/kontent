import Link from "next/link";

const TABS: [string, string][] = [["/app/admin", "Обзор"], ["/app/admin/orgs", "Организации"], ["/app/admin/users", "Пользователи"], ["/app/admin/audit", "Журнал"], ["/app/settings", "Настройки ИИ"]];

export function AdminNav({ active }: { active: string }) {
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-line pb-3 text-sm">
      {TABS.map(([href, label]) => <Link key={href} href={href} className={`rounded-lg px-3 py-1.5 ${active === href ? "bg-tile font-medium" : "text-ink2 hover:bg-tile/60"}`}>{label}</Link>)}
    </div>
  );
}
