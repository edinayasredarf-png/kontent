import { q } from "./db";
import { audit } from "./admin";

type Actor = { id: string; email: string };
type R = { ok: true; message?: string } | { ok: false; error: string };
const DAY = 86_400_000;

export const EXPENSE_CATEGORIES: Record<string, string> = { server: "Сервер и хостинг", domain: "Домены, прокси, почта", service: "Сервисы и подписки", marketing: "Маркетинг и реклама", payroll: "Зарплата и подрядчики", payments: "Комиссии платежей", other: "Прочее" };
export interface Expense { id: string; title: string; category: string; amount_kop: number; spent_on: string; recurring: "once" | "monthly"; end_on: string | null; note: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY));
const daysInMonth = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); };

export async function addExpense(actor: Actor, v: { title: string; category: string; rub: number; date: string; recurring: string; endOn?: string; note?: string }): Promise<R> {
  const title = v.title.replace(/\s+/g, " ").trim();
  if (title.length < 2 || title.length > 120) return { ok: false, error: "Название — от 2 до 120 знаков" };
  if (!Number.isFinite(v.rub) || v.rub < 0 || v.rub > 100_000_000) return { ok: false, error: "Сумма — число от 0 до 100 000 000 ₽" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || Number.isNaN(Date.parse(v.date))) return { ok: false, error: "Укажите дату" };
  const recurring = v.recurring === "monthly" ? "monthly" : "once";
  const end = recurring === "monthly" && /^\d{4}-\d{2}-\d{2}$/.test(v.endOn ?? "") ? v.endOn! : null;
  if (end && end < v.date) return { ok: false, error: "Дата окончания раньше даты начала" };
  const category = v.category in EXPENSE_CATEGORIES ? v.category : "other";
  const r = await q<{ id: string }>("insert into kz_expenses(title,category,amount_kop,spent_on,recurring,end_on,note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id", [title, category, Math.round(v.rub * 100), v.date, recurring, end, (v.note ?? "").slice(0, 300), actor.email]);
  await audit(actor, "expense.add", "expense", r[0].id, { title, rub: v.rub, recurring });
  return { ok: true, message: "Расход добавлен" };
}

export async function deleteExpense(actor: Actor, id: string): Promise<R> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Не найдено" };
  const r = await q<{ title: string }>("delete from kz_expenses where id=$1 returning title", [id]);
  if (!r.length) return { ok: false, error: "Не найдено" };
  await audit(actor, "expense.delete", "expense", id, { title: r[0].title });
  return { ok: true, message: "Расход удалён" };
}

export const listExpenses = () => q<Expense>("select id,title,category,amount_kop::int amount_kop,to_char(spent_on,'YYYY-MM-DD') spent_on,recurring,to_char(end_on,'YYYY-MM-DD') end_on,note from kz_expenses order by spent_on desc, created_at desc limit 300").catch(() => [] as Expense[]);

/**
 * Расходы по дням за период (даты YYYY-MM-DD, включительно). Разовый расход относится ко дню оплаты; ежемесячный размазывается по дням:
 * за каждый день месяца его доля — сумма / число дней месяца, пока не наступит дата окончания.
 */
export function expensesByDay(list: Expense[], from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  if (from > to) return out;
  const last = Math.min(Date.parse(`${to}T00:00:00Z`), Date.parse(`${from}T00:00:00Z`) + 3660 * DAY);
  for (const e of list) {
    if (e.recurring === "once") { if (e.spent_on >= from && e.spent_on <= to) out.set(e.spent_on, (out.get(e.spent_on) ?? 0) + e.amount_kop); continue; }
    for (let t = Date.parse(`${e.spent_on > from ? e.spent_on : from}T00:00:00Z`); t <= last; t += DAY) {
      const d = iso(new Date(t));
      if (d < e.spent_on || (e.end_on && d > e.end_on)) continue;
      out.set(d, (out.get(d) ?? 0) + e.amount_kop / daysInMonth(d));
    }
  }
  return out;
}

export interface ExpenseTotals { total: number; byCategory: Record<string, number> }
/** Итог расходов за период и по категориям. */
export function expenseTotals(list: Expense[], from: string, to: string): ExpenseTotals {
  const res: ExpenseTotals = { total: 0, byCategory: {} };
  for (const c of Object.keys(EXPENSE_CATEGORIES)) {
    const sub = list.filter((e) => e.category === c);
    let sum = 0; for (const v of expensesByDay(sub, from, to).values()) sum += v;
    if (sum) res.byCategory[c] = sum;
    res.total += sum;
  }
  return res;
}
export { addDays };
