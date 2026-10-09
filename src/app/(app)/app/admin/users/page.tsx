import Link from "next/link";
import { listUsers, requireAdmin } from "@/lib/admin";
import { Form } from "@/components/Form";
import { disableUserAction, logoutUserAction, resetLinkAction } from "@/lib/admin-actions";
import { AdminNav } from "@/components/AdminNav";
import { PageHead } from "@/components/ui";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const { q: query = "", p } = await searchParams;
  await requireAdmin();
  const page = Math.max(1, Number(p) || 1);
  const { rows, more } = await listUsers(query.slice(0, 80), page);
  const href = (n: number) => `/app/admin/users?${new URLSearchParams({ ...(query ? { q: query } : {}), p: String(n) })}`;
  return (
    <>
      <PageHead title="Пользователи" sub="Поиск по email и имени." />
      <AdminNav active="/app/admin/users" />
      <form className="card mb-4 flex gap-2 p-3"><input name="q" defaultValue={query} placeholder="Email или имя" className="input" /><button className="btn">Найти</button></form>
      <div className="card">
        {rows.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 last:border-0">
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{u.name || u.email}{u.disabled && <span className="chip ml-2 !bg-bad-soft !text-bad">заблокирован</span>}{!u.has_password && <span className="chip ml-2">вход через соцсеть</span>}</div>
              <div className="truncate text-xs text-ink3">{u.email} · с {new Date(u.created_at).toLocaleDateString("ru-RU")} · организаций: {u.orgs}{u.consent_at ? "" : " · согласие не зафиксировано"}</div></div>
            <Form action={resetLinkAction} submit="Ссылка сброса" variant="ghost" className="contents"><input type="hidden" name="user" value={u.id} /></Form>
            <Form action={logoutUserAction} submit="Выйти везде" variant="ghost" className="contents"><input type="hidden" name="user" value={u.id} /></Form>
            <Form action={disableUserAction} submit={u.disabled ? "Разблокировать" : "Заблокировать"} variant="danger" className="contents"><input type="hidden" name="user" value={u.id} /><input type="hidden" name="disable" value={u.disabled ? "0" : "1"} /></Form>
          </div>))}
        {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink2">Ничего не найдено.</p>}
      </div>
      {(page > 1 || more) && <div className="mt-4 flex justify-center gap-2">{page > 1 && <Link className="btn btn-ghost" href={href(page - 1)}>← Назад</Link>}{more && <Link className="btn btn-ghost" href={href(page + 1)}>Дальше →</Link>}</div>}
    </>
  );
}
