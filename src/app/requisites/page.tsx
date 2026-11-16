import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { loadOperator } from "@/lib/legal";
export const dynamic = "force-dynamic";
export const metadata = { title: "Реквизиты и контакты — JuicerAI", description: "Получатель оплаты, реквизиты и контакты сервиса JuicerAI." };
export default async function Requisites() {
  const o = await loadOperator();
  const rows = [['Получатель оплаты',o.name],['ИНН',o.inn],['ОГРНИП',o.ogrn],['Дата регистрации ИП',o.ogrn === '320619600158597' ? '16.11.2020' : ''],['Адрес места нахождения',o.address],['Банк',o.bank],['Расчётный счёт',o.account],['Корреспондентский счёт',o.corrAccount],['БИК',o.bic],['Телефон',o.phone]].filter(([,value])=>!!value);
  return <main className="mx-auto max-w-3xl px-5 py-10 sm:py-16"><Logo href="/" /><h1 className="mb-3 mt-10 text-3xl font-semibold">Реквизиты и контакты</h1><p className="mb-8 text-sm leading-6 text-ink2">JuicerAI — сервис создания и планирования контента для бизнеса. Ниже указаны данные получателя оплаты и контакты для обращений.</p>
    <dl className="overflow-hidden rounded-2xl border border-line">{rows.map(([label,value])=><div key={label} className="grid gap-1 border-b border-line p-4 last:border-0 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-ink3">{label}</dt><dd className="break-words text-sm font-medium">{value}</dd></div>)}{o.email && <div className="grid gap-1 p-4 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-ink3">Email</dt><dd className="break-all text-sm"><a href={`mailto:${o.email}`} className="text-accent-ink underline">{o.email}</a></dd></div>}</dl>
    <LegalLinks className="mb-6 mt-8" /><Link href="/" className="text-sm text-accent-ink">← На главную</Link>
  </main>;
}
