import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { orgDetail, requireAdmin } from "@/lib/admin";
import { PLANS } from "@/lib/plans";
import { rub } from "@/lib/wallet";
import { ROLE_LABEL } from "@/lib/team";
import { Form, Field } from "@/components/Form";
import { adjustBalanceAction, disableUserAction, logoutUserAction, resetLinkAction, setPlanAction, suspendOrgAction } from "@/lib/admin-actions";
import { PageHead } from "@/components/ui";

export default async function OrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const d = await orgDetail(id);
  if (!d) notFound();
  const { org, members, factories, tx, usage } = d;
  return (
    <>
      <Link href="/app/admin/orgs" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Организации</Link>
      <PageHead title={org.name} sub={`Создана ${new Date(org.created_at).toLocaleDateString("ru-RU")} · материалов ${usage.items} · файлов ${(Number(usage.assets) / 1048576).toFixed(1)} МБ`}
        action={<span className="flex gap-2">{org.suspended && <span className="chip !bg-bad-soft !text-bad">приостановлена</span>}{org.unlimited && <span className="chip">безлимит</span>}</span>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="card">
            <div className="border-b border-line px-5 py-3 text-sm font-medium">Участники</div>
            {members.map((m) => (
              <div key={m.user_id} className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 last:border-0">
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{m.name || m.email}{m.disabled && <span className="chip ml-2 !bg-bad-soft !text-bad">заблокирован</span>}</div><div className="truncate text-xs text-ink3">{m.email}</div></div>
                <span className="chip">{ROLE_LABEL[m.role]}</span>
                <Form action={resetLinkAction} submit="Ссылка сброса пароля" variant="ghost" className="contents"><input type="hidden" name="user" value={m.user_id} /></Form>
                <Form action={logoutUserAction} submit="Выйти везде" variant="ghost" className="contents"><input type="hidden" name="user" value={m.user_id} /></Form>
                <Form action={disableUserAction} submit={m.disabled ? "Разблокировать" : "Заблокировать"} variant="danger" className="contents"><input type="hidden" name="user" value={m.user_id} /><input type="hidden" name="disable" value={m.disabled ? "0" : "1"} /></Form>
              </div>))}
          </section>
          <section className="card">
            <div className="border-b border-line px-5 py-3 text-sm font-medium">Заводы ({factories.length})</div>
            {factories.length === 0 && <p className="px-5 py-5 text-sm text-ink2">Нет заводов.</p>}
            {factories.map((f) => <div key={f.id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0"><span className="flex-1">{f.name}</span><span className="text-xs text-ink3">{f.brand}</span><span className="chip">{f.status === "active" ? "работает" : "пауза"}</span><span className="text-xs text-ink3">{f.items} мат.</span></div>)}
          </section>
          <section className="card">
            <div className="border-b border-line px-5 py-3 text-sm font-medium">Операции по балансу</div>
            {tx.map((t) => <div key={t.id} className="flex items-center gap-3 border-b border-line px-5 py-2 text-sm last:border-0"><span className="min-w-0 flex-1 truncate">{t.reason}</span><span className="text-xs text-ink3">{new Date(t.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><b className={Number(t.amount_kop) < 0 ? "" : "text-good"}>{Number(t.amount_kop) > 0 ? "+" : ""}{rub(Number(t.amount_kop))}</b></div>)}
          </section>
        </div>
        <div className="space-y-6">
          <section className="card p-5">
            <b className="mb-1 block text-sm">Баланс: {rub(Number(org.balance_kop))}</b>
            <p className="mb-4 text-xs text-ink2">Положительная сумма пополняет, отрицательная списывает. Операция попадает в журнал баланса клиента и в аудит.</p>
            <Form action={adjustBalanceAction} submit="Применить">
              <input type="hidden" name="org" value={org.id} />
              <Field label="Сумма, ₽"><input name="amount" required inputMode="decimal" placeholder="500 или -200" className="input" /></Field>
              <Field label="Причина"><input name="reason" required minLength={3} maxLength={200} placeholder="Оплата по счёту №12 / компенсация" className="input" /></Field>
            </Form>
          </section>
          <section className="card p-5">
            <b className="mb-4 block text-sm">Тариф</b>
            <Form action={setPlanAction} submit="Сохранить тариф">
              <input type="hidden" name="org" value={org.id} />
              <select name="plan" defaultValue={org.plan} className="input">{Object.values(PLANS).map((p) => <option key={p.key} value={p.key}>{p.name}{p.priceRub ? ` — ${p.priceRub.toLocaleString("ru-RU")} ₽/мес` : ""}</option>)}</select>
            </Form>
          </section>
          <section className="card p-5">
            <b className="mb-1 block text-sm">Доступ организации</b>
            <p className="mb-3 text-xs text-ink2">Приостановка закрывает вход участникам и останавливает воркер для этой организации. Данные не удаляются.</p>
            <Form action={suspendOrgAction} submit={org.suspended ? "Возобновить" : "Приостановить"}><input type="hidden" name="org" value={org.id} /><input type="hidden" name="suspend" value={org.suspended ? "0" : "1"} /></Form>
          </section>
        </div>
      </div>
    </>
  );
}
