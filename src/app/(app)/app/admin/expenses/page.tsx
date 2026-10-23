import { requireAdmin } from "@/lib/admin";
import { addExpenseAction, deleteExpenseAction } from "@/lib/admin-econ-actions";
import { EXPENSE_CATEGORIES, expenseTotals, listExpenses } from "@/lib/expenses";
import { rub } from "@/lib/wallet";
import { AdminNav } from "@/components/AdminNav";
import { Form } from "@/components/Form";
import { PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const inp = "input !py-1.5 text-sm";
const d = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function Expenses() {
  await requireAdmin();
  const list = await listExpenses();
  const now = new Date(Date.now() + 3 * 3_600_000);
  const today = now.toISOString().slice(0, 10), ym = today.slice(0, 7);
  const monthStart = `${ym}-01`;
  const cur = expenseTotals(list, monthStart, today);
  const monthly = list.filter((e) => e.recurring === "monthly" && (!e.end_on || e.end_on >= today)).reduce((a, e) => a + e.amount_kop, 0);
  return (
    <>
      <PageHead title="Расходы" sub="Траты, которые не входят в нейросети: сервер, домены, подписки, реклама, зарплаты. Они вычитаются из выручки в «Экономике», чтобы видеть настоящую прибыль." />
      <AdminNav active="/app/admin/expenses" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl bg-tile p-5"><div className="mb-1 text-sm text-ink2">С начала месяца</div><div className="text-xl font-semibold">{rub(Math.round(cur.total))}</div></div>
        <div className="rounded-2xl bg-tile p-5"><div className="mb-1 text-sm text-ink2">Постоянные в месяц</div><div className="text-xl font-semibold">{rub(monthly)}</div></div>
        <div className="col-span-2 rounded-2xl bg-tile p-5 lg:col-span-1"><div className="mb-1 text-sm text-ink2">По категориям с начала месяца</div><div className="space-y-0.5 text-sm">{Object.entries(cur.byCategory).map(([k, v]) => <div key={k} className="flex justify-between"><span>{EXPENSE_CATEGORIES[k]}</span><b>{rub(Math.round(v))}</b></div>)}{Object.keys(cur.byCategory).length === 0 && <span className="text-ink3">Пока нет</span>}</div></div>
      </div>

      <section className="card mb-6 p-5">
        <b className="mb-1 block text-sm">Добавить расход</b>
        <p className="mb-4 text-xs text-ink2">Разовый расход относится ко дню оплаты. Ежемесячный (например, сервер) распределяется по дням месяца и действует, пока не указана дата окончания: так прибыль по любому периоду считается честно.</p>
        <Form action={addExpenseAction} submit="Добавить" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-ink2 sm:col-span-2">Название<input name="title" required maxLength={120} placeholder="Например: Сервер Timeweb (прокси)" className={`${inp} mt-1`} /></label>
          <label className="text-xs text-ink2">Категория<select name="category" className={`${inp} mt-1`}>{Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs text-ink2">Сумма, ₽<input name="amount" required inputMode="decimal" placeholder="1500" className={`${inp} mt-1`} /></label>
          <label className="text-xs text-ink2">Дата (начала)<input name="date" type="date" required defaultValue={today} className={`${inp} mt-1`} /></label>
          <label className="text-xs text-ink2">Как часто<select name="recurring" className={`${inp} mt-1`}><option value="once">Разовый</option><option value="monthly">Каждый месяц</option></select></label>
          <label className="text-xs text-ink2">Закончился (для ежемесячных)<input name="endOn" type="date" className={`${inp} mt-1`} /></label>
          <label className="text-xs text-ink2 sm:col-span-2">Заметка<input name="note" maxLength={300} placeholder="Необязательно" className={`${inp} mt-1`} /></label>
        </Form>
      </section>

      <section className="card mb-6 overflow-x-auto">
        <div className="border-b border-line px-5 py-3 text-sm font-medium">Все расходы</div>
        <table className="w-full min-w-[640px] text-sm"><tbody>
          {list.length === 0 && <tr><td className="px-5 py-8 text-center text-ink2">Расходов пока нет. Добавьте сервер, домены и другие траты, чтобы видеть настоящую прибыль.</td></tr>}
          {list.map((e) => (
            <tr key={e.id} className="border-t border-line first:border-0">
              <td className="px-5 py-2.5"><div className="font-medium">{e.title}</div><div className="text-xs text-ink3">{EXPENSE_CATEGORIES[e.category] ?? e.category}{e.note ? ` · ${e.note}` : ""}</div></td>
              <td className="px-2 py-2.5 text-xs text-ink2">{e.recurring === "monthly" ? <>каждый месяц<br />с {d(e.spent_on)}{e.end_on ? ` по ${d(e.end_on)}` : ""}</> : d(e.spent_on)}</td>
              <td className="px-2 py-2.5 text-right font-semibold">{rub(e.amount_kop)}{e.recurring === "monthly" && <span className="text-xs font-normal text-ink3"> / мес.</span>}</td>
              <td className="px-5 py-2.5 text-right"><form action={deleteExpenseAction}><input type="hidden" name="id" value={e.id} /><SubmitButton data-confirm={`Удалить расход «${e.title}»?`} className="text-xs text-bad hover:underline">Удалить</SubmitButton></form></td>
            </tr>))}
        </tbody></table>
      </section>
    </>
  );
}
