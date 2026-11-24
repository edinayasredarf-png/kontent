import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PRODUCT_PAGES } from "@/lib/marketing-content";

export default function PublicProductLayout({ children }: { children: React.ReactNode }) {
  return <div className="lt-light min-h-dvh bg-white text-black">
    <header className="border-b border-black/5 bg-white">
      <div className="mx-auto flex min-h-20 max-w-[1360px] flex-wrap items-center justify-between gap-3 px-5 py-3">
        <Logo href="/" light h={40} />
        <nav aria-label="Основная навигация" className="flex items-center gap-2 text-sm font-semibold sm:text-base">
          <Link href="/" className="hidden rounded-full px-4 py-3 hover:bg-[#f5f5f5] sm:inline-flex">Главная</Link>
          <Link href="/register" className="rounded-full bg-[#0070F0] px-5 py-3 text-white hover:bg-[#005dcc]">Регистрация</Link>
        </nav>
      </div>
    </header>
    {children}
    <footer className="mt-24 bg-neutral-800 text-white">
      <div className="mx-auto grid max-w-[1360px] gap-8 px-5 py-12 md:grid-cols-2">
        <div><Link href="/" className="text-2xl font-semibold">JuicerAI</Link><p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">Контент-завод с ИИ: от идеи и настроек бренда до публикации в подключённых каналах.</p><a href="mailto:info@juicerai.ru" className="mt-4 inline-block underline underline-offset-4">info@juicerai.ru</a></div>
        <nav aria-label="Возможности и документы" className="grid gap-3 text-sm">
          <Link href="/vozmozhnosti">Все возможности</Link>
          {PRODUCT_PAGES.map(p => <Link key={p.slug} href={`/vozmozhnosti/${p.slug}`}>{p.label}</Link>)}
          <Link href="/requisites">Реквизиты</Link><Link href="/legal/privacy">Политика конфиденциальности</Link>
        </nav>
      </div>
    </footer>
  </div>;
}
