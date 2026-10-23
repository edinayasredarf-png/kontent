import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { econByAction, econByModel, orgEconInfo, recentUsage } from "@/lib/admin-econ";
import { bounds, parseRange, rangeLabel, type Preset } from "@/lib/range";
import { setUnlimitedAction } from "@/lib/admin-econ-actions";
import { ACTIONS } from "@/lib/billing";
import { AdminNav } from "@/components/AdminNav";
import { FilterBar } from "@/components/FilterBar";
import { Form } from "@/components/Form";
import { PageHead } from "@/components/ui";
import { rub } from "@/lib/wallet";
import { ActionTable } from "@/components/AdminActionTable";

const PRESETS: [Preset, string][] = [["today", "Сегодня"], ["7", "7 дней"], ["30", "30 дней"], ["all", "Всё время"]];
const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} млн` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} тыс` : String(n));

export default async function OrgEconomy({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  const { id } = await params;
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const info = await orgEconInfo(id);
  if (!info) notFound();
  const rg = parseRange(sp, [...PRESETS.map(([x]) => x), "custom"], "30");
  const b = bounds(rg);
  const [byAction, byModel, recent] = await Promise.all([econByAction(b, id), econByModel(b, id), recentUsage(id, 60)]);
  const rev = byAction.reduce((a, r) => a + r.charged - r.refunded, 0), cost = byAction.reduce((a, r) => a + r.cost, 0), calls = byAction.reduce((a, r) => a + r.calls, 0);
  const active = info.until && new Date(info.until) > new Date();
  return (
    <>
      <Link href="/app/admin/economy" className="mb-1 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />Экономика</Link>
      <PageHead title={info.org.name} sub={`${info.members.map((m) => m.email).join(", ")} · тариф ${info.org.plan} · баланс ${rub(Number(info.org.balance_kop))}`} />
      <AdminNav active="/app/admin/economy" />
      <FilterBar path={`/app/admin/economy/${id}`} presets={PRESETS} r={rg.r} from={rg.from} to={rg.to} selects={[]} />
      <p className="-mt-2 mb-5 text-center text-xs text-ink3">Период: {rangeLabel(rg)}</p>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Списано с клиента", rub(rev)], ["Затраты на нейросети", rub(Math.round(cost))], ["Маржа", `${rub(Math.round(rev - cost))}${rev > 0 ? ` · ${Math.round(((rev - cost) / rev) * 100)}%` : ""}`], ["Вызовов нейросетей", calls.toLocaleString("ru-RU")]].map(([l, v]) => <div key={l} className="rounded-2xl bg-tile p-5"><div className="mb-1 text-sm text-ink2">{l}</div><div className="text-xl font-semibold">{v}</div></div>)}
      </div>
      <section className="card mb-6 p-5">
        <b className="mb-1 block text-sm">Безлимит для тестирования</b>
        <p className="mb-3 text-xs text-ink2">{info.org.unlimited ? "У организации постоянный безлимит (владелец в списке администраторов платформы)." : active ? <>Пробный безлимит действует до <b>{new Date(info.until!).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</b>: генерации не списывают баланс, но расходы на нейросети продолжают учитываться.</> : "Сейчас клиент платит с баланса. Выдайте безлимит на срок: он закончится сам."}</p>
        <Form action={setUnlimitedAction} submit="Применить" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="org" value={id} />
          <label className="text-xs text-ink2">Дней (0 — снять)<input name="days" type="number" min={0} max={365} defaultValue={7} className="input mt-1 !w-28 !py-1.5" /></label>
          <div className="flex gap-1.5 pb-0.5 text-xs text-ink3">срок прибавляется к текущему</div>
        </Form>
      </section>
      <ActionTable rows={byAction} title="По действиям" />
      <section className="card mb-6 overflow-x-auto">
        <div className="border-b border-line px-5 py-3 text-sm font-medium">По моделям</div>
        <table className="w-full min-w-[560px] text-sm"><tbody>{byModel.length === 0 && <tr><td className="px-5 py-5 text-center text-ink2">Нет вызовов за период.</td></tr>}
          {byModel.map((m) => <tr key={m.model + m.kind} className="border-t border-line first:border-0"><td className="px-5 py-2">{m.model || "—"} <span className="chip">{m.kind}</span></td><td className="px-2 py-2 text-right">{m.calls}</td><td className="px-2 py-2 text-right text-xs">{tok(m.tokensIn)} / {tok(m.tokensOut)}</td><td className="px-5 py-2 text-right">{rub(Math.round(m.cost))}</td></tr>)}</tbody></table>
      </section>
      <section className="card mb-6 overflow-x-auto">
        <div className="border-b border-line px-5 py-3 text-sm font-medium">Последние вызовы нейросетей</div>
        <table className="w-full min-w-[700px] text-sm"><tbody>{recent.length === 0 && <tr><td className="px-5 py-5 text-center text-ink2">Вызовов пока нет.</td></tr>}
          {recent.map((u) => <tr key={u.id} className="border-t border-line first:border-0"><td className="px-5 py-2 text-xs text-ink3">{new Date(u.at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td className="px-2 py-2">{ACTIONS[u.action] ?? u.action}<div className="max-w-[260px] truncate text-xs text-ink3">{u.reason}</div></td><td className="px-2 py-2 text-xs">{u.model}</td><td className="px-2 py-2 text-right text-xs">{u.kind === "image" ? `${u.images} карт.` : `${u.tin} / ${u.tout}`}</td><td className="px-5 py-2 text-right">{Number(u.cost).toFixed(2)} коп.{!u.priced && <span className="text-warn"> *</span>}</td></tr>)}</tbody></table>
      </section>
    </>
  );
}
