import Link from "next/link";
import { listOrgs, requireAdmin } from "@/lib/admin";
import { PLANS } from "@/lib/plans";
import { rub } from "@/lib/wallet";
import { AdminNav } from "@/components/AdminNav";
import { PageHead } from "@/components/ui";

export default async function Orgs({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const { q: query = "", p } = await searchParams;
  await requireAdmin();
  const page = Math.max(1, Number(p) || 1);
  const { rows, more } = await listOrgs(query.slice(0, 80), page);
  const href = (n: number) => `/app/admin/orgs?${new URLSearchParams({ ...(query ? { q: query } : {}), p: String(n) })}`;
  return (
    <>
      <PageHead title="Организации" sub="Клиенты платформы. Поиск по названию и email участника." />
      <AdminNav active="/app/admin/orgs" />
      <form className="card mb-4 flex gap-2 p-3"><input name="q" defaultValue={query} placeholder="Название или email" className="input" /><button className="btn">Найти</button></form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink3"><th className="px-4 py-2 font-normal">Организация</th><th className="px-2 font-normal">Владелец</th><th className="px-2 font-normal">Тариф</th><th className="px-2 text-right font-normal">Баланс</th><th className="px-2 text-right font-normal">Бр/Зав</th><th className="px-4 font-normal">Создана</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 hover:bg-tile/50">
              <td className="px-4 py-2.5"><Link href={`/app/admin/orgs/${r.id}`} className="font-medium text-accent-ink hover:underline">{r.name}</Link>{r.suspended && <span className="chip ml-2 !bg-bad-soft !text-bad">приостановлена</span>}{r.unlimited && <span className="chip ml-2">безлимит</span>}</td>
              <td className="px-2 text-ink2">{r.owner ?? "—"}</td><td className="px-2">{PLANS[r.plan]?.name ?? r.plan}</td>
              <td className="px-2 text-right">{rub(Number(r.balance_kop))}</td><td className="px-2 text-right text-ink2">{r.brands}/{r.factories}</td>
              <td className="px-4 text-xs text-ink3">{new Date(r.created_at).toLocaleDateString("ru-RU")}</td>
            </tr>))}</tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink2">Ничего не найдено.</p>}
      </div>
      {(page > 1 || more) && <div className="mt-4 flex justify-center gap-2">{page > 1 && <Link className="btn btn-ghost" href={href(page - 1)}>← Назад</Link>}{more && <Link className="btn btn-ghost" href={href(page + 1)}>Дальше →</Link>}</div>}
    </>
  );
}
