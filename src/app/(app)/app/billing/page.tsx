import { Check } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { q } from "@/lib/db";
import { PLANS, fmtLimit } from "@/lib/plans";
import { rub } from "@/lib/wallet";
import { setPlan } from "@/lib/actions";
import { PageHead } from "@/components/ui";

export default async function Billing() {
  const c = await requireCtx();
  const tx = await q<{ id: string; amount_kop: string; reason: string; created_at: string }>(
    "select id,amount_kop,reason,created_at from kz_wallet_tx where org_id=$1 order by created_at desc limit 30", [c.org.id]);
  const free = process.env.ALLOW_FREE_PLAN_SWITCH === "1";
  return (
    <>
      <PageHead title="Баланс и тариф" sub={c.org.unlimited ? "Администратор платформы: лимиты тарифа и списания отключены" : `Баланс: ${rub(c.org.balance_kop)}`} />
      <div className="mb-8 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Object.values(PLANS).map((p) => {
          const cur = p.key === c.org.plan;
          return (
            <div key={p.key} className={`card flex flex-col p-5 ${cur ? "!border-accent" : ""}`}>
              <b>{p.name}</b><div className="mb-3 text-xl font-semibold">{p.priceRub ? `${p.priceRub.toLocaleString("ru-RU")} ₽` : "0 ₽"}<span className="text-xs font-normal text-ink3">/мес</span></div>
              <ul className="mb-4 flex-1 space-y-1.5 text-sm text-ink2">
                <li>Брендов: {fmtLimit(p.brands)}</li><li>Заводов: {fmtLimit(p.factories)}</li><li>Участников: {fmtLimit(p.members)}</li>
                {p.features.map((f) => <li key={f} className="flex gap-1.5"><Check size={14} className="mt-0.5 shrink-0 text-good" />{f}</li>)}
              </ul>
              {cur ? <span className="chip justify-center">Текущий</span> : (
                <form action={setPlan}><input type="hidden" name="plan" value={p.key} /><button className="btn btn-ghost w-full justify-center" disabled={!free}>{free ? "Выбрать" : "Скоро"}</button></form>
              )}
            </div>
          );
        })}
      </div>
      {!free && <p className="mb-8 text-xs text-ink3">Оплата тарифов и пополнение баланса подключаются вместе с платёжным шлюзом.</p>}
      <div className="card">
        <div className="border-b border-line px-5 py-3 text-sm font-medium">Операции</div>
        {tx.map((t) => (
          <div key={t.id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0">
            <span className="min-w-0 flex-1 truncate">{t.reason}</span>
            <span className="text-xs text-ink3">{new Date(t.created_at).toLocaleDateString("ru-RU")}</span>
            <b className={Number(t.amount_kop) < 0 ? "text-ink" : "text-good"}>{Number(t.amount_kop) > 0 ? "+" : ""}{rub(Number(t.amount_kop))}</b>
          </div>
        ))}
      </div>
    </>
  );
}
