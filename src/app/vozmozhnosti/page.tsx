import Link from "next/link";
import Image from "next/image";
import { PRODUCT_PAGES } from "@/lib/marketing-content";
import { publicMetadata } from "@/lib/public-seo";

export const metadata = publicMetadata("Возможности контент-завода с ИИ — JuicerAI", "Как создавать посты с нейросетью, собирать контент-план и публиковать материалы в Telegram, VK и MAX. Руководства по возможностям JuicerAI.", "/vozmozhnosti");
export default function ProductGuides() {
  return <main className="mx-auto max-w-[1360px] px-5">
    <section className="max-w-3xl py-16 md:py-24"><Link href="/" className="text-sm text-neutral-600 hover:underline">← Главная</Link><p className="mt-8 font-semibold text-[#0070F0]">Возможности JuicerAI</p><h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight md:text-6xl">Создание и публикация контента с ИИ</h1><p className="mt-6 text-xl leading-relaxed text-neutral-600">Выберите задачу: подготовить пост, спланировать темы или настроить публикации. В каждом руководстве — порядок работы, примеры и ограничения, которые стоит учесть до запуска.</p></section>
    <div className="space-y-6">{PRODUCT_PAGES.map((page, index) => <section key={page.slug} className="grid items-center gap-8 rounded-[32px] bg-[#f5f5f5] p-7 md:grid-cols-[220px_1fr] md:p-10"><Image src={`/landing/step-${index === 0 ? 3 : index === 1 ? 2 : 4}.webp`} alt="" width={240} height={240} className="mx-auto h-48 w-48 object-contain" /><div><h2 className="text-2xl font-semibold md:text-3xl"><Link href={`/vozmozhnosti/${page.slug}`} className="hover:text-[#0070F0]">{page.label}</Link></h2><p className="mt-4 max-w-3xl text-lg leading-relaxed text-neutral-600">{page.intro}</p><Link href={`/vozmozhnosti/${page.slug}`} className="mt-5 inline-flex font-semibold text-[#0070F0] hover:underline">Читать руководство →</Link></div></section>)}</div>
    <section className="mt-16 rounded-[32px] bg-[#0070F0] p-8 text-white md:p-14"><h2 className="text-3xl font-semibold">Все этапы в одном сервисе</h2><p className="mt-5 max-w-3xl text-lg leading-relaxed">JuicerAI связывает настройки бренда, идеи, черновики и подключённые каналы. Начните с описания своего продукта и аудитории, затем проверьте результат на одном материале. После этого можно переходить к регулярному плану публикаций. Набор доступных функций и число проектов зависят от тарифа.</p><Link href="/" className="mt-7 inline-flex rounded-full bg-white px-7 py-4 font-semibold text-black">Посмотреть сервис и тарифы</Link></section>
  </main>;
}
