import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { loadOperator } from "@/lib/legal";
export const dynamic = "force-dynamic";
export const metadata = { title: "Реквизиты и контакты — JuicerAI", description: "Получатель оплаты, реквизиты и контакты сервиса JuicerAI." };
export default async function Requisites() {
  const o = await loadOperator();
  const rows = [['Получатель оплаты',o.name],['ИНН',o.inn],['ОГРН / ОГРНИП',o.ogrn],['Адрес / регион регистрации',o.address],['Банк',o.bank],['Расчётный счёт',o.account],['Корреспондентский счёт',o.corrAccount],['БИК',o.bic],['Телефон',o.phone]].filter(([,value])=>!!value);
  return <main className="mx-auto max-w-3xl px-5 py-10 sm:py-16"><Logo href="/" /><h1 className="mb-3 mt-10 text-3xl font-semibold">Реквизиты и контакты</h1><p className="mb-8 text-sm leading-6 text-ink2">JuicerAI — сервис создания и планирования контента для бизнеса. Ниже указаны данные получателя оплаты и контакты для обращений.</p>
    <dl className="overflow-hidden rounded-2xl border border-line">{rows.map(([label,value])=><div key={label} className="grid gap-1 border-b border-line p-4 last:border-0 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-ink3">{label}</dt><dd className="break-words text-sm font-medium">{value}</dd></div>)}{o.email && <div className="grid gap-1 p-4 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-ink3">Email</dt><dd className="break-all text-sm"><a href={`mailto:${o.email}`} className="text-accent-ink underline">{o.email}</a></dd></div>}</dl>
    <section className="my-8 space-y-3 rounded-2xl bg-tile p-5"><h2 className="font-semibold">Оплата и обращения</h2><p className="text-sm leading-6 text-ink2">Тарифы оплачиваются в рублях через ЮKassa. После подтверждения оплаты подключаются функции тарифа и начисляется пакет токенов JuicerAI. Стоимость и состав пакета указаны перед оплатой.</p><p className="text-sm leading-6 text-ink2">По вопросам оплаты, доступа и возврата средств напишите на контактный email. Укажите email аккаунта и номер платежа, чтобы мы могли найти покупку.</p><Link href="/legal/terms" className="link-btn text-sm">Условия использования сервиса</Link></section>
    <LegalLinks className="mb-6" /><Link href="/" className="text-sm text-accent-ink">← На главную</Link>
  </main>;
}
