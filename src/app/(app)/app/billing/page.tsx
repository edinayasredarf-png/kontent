import { randomUUID } from "node:crypto";
import { Check } from "lucide-react";
import Link from "next/link";
import { pageCtx } from "@/lib/auth";
import { can } from "@/lib/roles";
import { q } from "@/lib/db";
import { fmtLimit } from "@/lib/plans";
import { planCatalog, orgPlan } from "@/lib/plan-catalog";
import { rub, PRICES, ensurePrices } from "@/lib/wallet";
import { tokens, tokenUnits } from "@/lib/tokens";
import { yooConfig } from "@/lib/yookassa";
import { syncPayment, type PaymentOrder } from "@/lib/payments";
import { checkoutAction, checkPaymentAction } from "@/lib/payment-actions";
import { PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
const AUDIENCE: Record<string, string> = { free: "Познакомиться с сервисом", start: "Один бизнес и регулярный контент", business: "Несколько направлений и площадок", pro: "Команда маркетинга", agency: "Работа с клиентскими проектами" };
export default async function Billing({ searchParams }: { searchParams: Promise<{ order?: string; err?: string }> }) {
  const c = await pageCtx("write");
  const sp = await searchParams;
  let payment: PaymentOrder | null = null, paymentError = "";
  if (sp.order && /^[0-9a-f-]{36}$/i.test(sp.order)) {
    try { payment = await syncPayment(sp.order, c.org.id); } catch { paymentError = "Не удалось обновить статус оплаты. Проверьте его ещё раз через минуту."; }
  }
  await ensurePrices();
  const [catalog, current, config, txs, term] = await Promise.all([
    planCatalog(), orgPlan(c.org.id), yooConfig(),
    q<{ id: string; amount_kop: string; reason: string; created_at: string }>("select id,amount_kop,reason,created_at from kz_wallet_tx where org_id=$1 order by created_at desc limit 30", [c.org.id]),
    q<{ plan_until: string | null }>("select plan_until from kz_orgs where id=$1", [c.org.id]),
  ]);
  const manager = can(c.org.role, "manage");
  return <>
    <PageHead title="Токены и тариф" sub={c.org.unlimited ? "Для этой организации действует безлимит" : `Доступно: ${tokens(c.org.balance_kop)} · тариф «${current.name}»`} />
    {term[0]?.plan_until && <p className="mb-4 text-sm text-ink2">Оплаченный срок: до {new Date(term[0].plan_until).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" })}. Токены не сгорают после окончания срока.</p>}
    {(sp.err || paymentError) && <p role="alert" className="mb-4 rounded-2xl bg-bad-soft p-4 text-sm text-bad">{sp.err || paymentError}</p>}
    {config.testMode && <p className="mb-5 rounded-2xl bg-warn-soft p-4 text-sm text-warn">Тестовый магазин ЮKassa: реальные деньги не списываются. Тестовый платёж проверяет оплату и не начисляет реальные токены.</p>}
    {payment && <div role="status" className="mb-5 space-y-3 rounded-2xl bg-accent-soft p-4 text-sm">
      <p>{payment.status === "succeeded" ? payment.test_mode ? "Тестовая оплата подтверждена. Проверка пройдена; реальный баланс не изменён." : "Оплата подтверждена. Тариф подключён, токены начислены." : payment.status === "canceled" ? "Платёж отменён. Токены не начислялись." : "Ожидаем подтверждение оплаты от ЮKassa."}</p>
      {!["succeeded", "canceled"].includes(payment.status) && <form action={checkPaymentAction}><input type="hidden" name="order" value={payment.id} /><SubmitButton className="btn btn-ghost">Проверить оплату</SubmitButton></form>}
    </div>}
    <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Object.values(catalog).filter(p => p.enabled && p.key !== "free").map(p => {
        const units = tokenUnits(p.tokens), requestKey = randomUUID();
        const equivalent = PRICES.post > 0 ? Math.floor(units / PRICES.post) : 0;
        return <section key={p.key} className={`card flex flex-col p-5 ${p.key === "business" ? "ring-2 ring-accent" : ""}`}>
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{p.name}</h2>{p.key === current.key && <span className="chip text-xs">Текущий</span>}</div>
          <p className="mb-3 text-sm text-ink2">{AUDIENCE[p.key]}</p>
          <p className="text-2xl font-semibold">{rub(Math.round(p.priceRub * 100))}<span className="text-xs font-normal text-ink3"> / {p.durationDays} дней</span></p>
          <p className="mb-1 mt-4 text-xl font-semibold text-accent-ink">{p.tokens.toLocaleString("ru-RU")} токенов</p>
          <p className="mb-4 text-xs text-ink3">{equivalent ? `Например, до ${equivalent} текстовых постов, если потратить весь пакет на них. Изображения оплачиваются отдельно токенами.` : "Токены на генерации и доработки."}</p>
          <ul className="mb-5 flex-1 space-y-2 text-sm text-ink2"><li>Брендов: {fmtLimit(p.brands)} · заводов: {fmtLimit(p.factories)}</li><li>Участников: {fmtLimit(p.members)} · источников: {fmtLimit(p.sources)}</li>{p.features.map(f => <li key={f} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-good" />{f}</li>)}{p.unlimitedModels.length > 0 && <li>Без списания токенов: {p.unlimitedModels.join(", ")}</li>}</ul>
          <form action={checkoutAction}><input type="hidden" name="plan" value={p.key} /><input type="hidden" name="requestKey" value={requestKey} /><label className="mb-3 flex items-start gap-2 text-xs text-ink2"><input name="accept" type="checkbox" required={!config.testMode} className="mt-0.5" /><span>{config.testMode ? "Тестовая оплата без списания реальных денег." : <>Принимаю <Link href="/legal/terms" className="underline">условия использования</Link> и условия выбранного пакета.</>}</span></label><SubmitButton className="btn btn-accent w-full justify-center" disabled={!manager || !config.enabled}>{!manager ? "Доступно владельцу и администратору" : !config.enabled ? "Оплата готовится" : config.testMode ? "Тестовая оплата" : p.key === current.key ? "Продлить тариф" : "Выбрать тариф"}</SubmitButton></form>
        </section>;
      })}
    </div>
    <section className="card mb-6 space-y-3 p-5"><h2 className="font-semibold">Как расходуются токены</h2><p className="text-sm text-ink2">Это внутренние токены JuicerAI. Они расходуются за готовое действие; стоимость видна перед запуском. При сбое генерации списанные токены возвращаются.</p><div className="flex flex-wrap gap-2">{[["Пост",PRICES.post],["Карусель",PRICES.carousel],["Изображение",PRICES.image],["SEO-статья",PRICES.seo],["Правка ИИ",PRICES.edit]].map(([label,price]) => <span key={label} className="chip">{label}: {tokens(Number(price))}</span>)}</div><p className="text-xs text-ink3">В каруселях с изображениями выбранной нейросети цена зависит от модели, качества и числа слайдов. Безлимит работает для указанных моделей в течение срока тарифа. При покупке другого тарифа его условия действуют сразу; неизрасходованные токены сохраняются. Автосписания с банковской карты не включены.</p>{c.isAdmin && <Link href="/app/admin/billing" className="link-btn text-sm">Настроить тарифы и ЮKassa</Link>}</section>
    <div className="card"><div className="border-b border-line px-5 py-3 text-sm font-medium">История токенов</div>{txs.map(t => <div key={t.id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0"><span className="min-w-0 flex-1 truncate">{t.reason}</span><span className="text-xs text-ink3">{new Date(t.created_at).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}</span><b className={Number(t.amount_kop) < 0 ? "text-ink" : "text-good"}>{Number(t.amount_kop) > 0 ? "+" : ""}{tokens(Number(t.amount_kop))}</b></div>)}</div>
  </>;
}
