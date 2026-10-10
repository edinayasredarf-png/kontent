import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BarChart3, Bot, Check, CalendarDays, FileText, GalleryHorizontal, ImageIcon, Layers, Megaphone, Palette, Plus,
  Radar, Send, ShieldCheck, Sparkles, Users, Wallet, X, Zap, Clock, Building2, Store, UserRound, Briefcase,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { SITE } from "@/lib/site";

const TITLE = "Контент-завод — ИИ-контент для соцсетей и сайта на автопилоте";
const DESC = "Опишите бренд один раз — Контент-завод сам составит контент-план, напишет посты, нарисует карусели и картинки и опубликует в Telegram, VK и MAX. Посты от 20 ₽, 100 ₽ в подарок при регистрации.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  keywords: ["контент для соцсетей", "ИИ контент-план", "автопостинг Telegram VK", "генератор постов", "карусели для соцсетей", "SMM автоматизация", "SEO-статьи нейросеть"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", url: SITE, siteName: "Контент-завод", locale: "ru_RU", title: TITLE, description: DESC, images: [{ url: "/demo/b1.jpg", width: 1080, height: 1350, alt: "Пример карусели, созданной Контент-заводом" }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: ["/demo/b1.jpg"] },
};

/** Декор из трёх форм логотипа: голубая, лаймовая, зелёная «капли». Мягкая замена 3D-иллюстрациям. */
function Blobs({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className={className} style={style} fill="none">
      <path d="M58.3 67.9a15 15 0 0 0 6.3-5.3l4.7-8c6.4-10.8 23-6.3 23 6.3v19.1c0 6.8-5.5 12.4-12.4 12.4H61.2c-13.7 0-17.2-19-4.4-23.9l1.5-.6Z" fill="#8EC180" />
      <path d="M36.3 51.7c-.2 2.8.6 5.6 2.2 7.9l5.3 7.6c7.2 10.3-3.8 23.6-15.3 18.3L11.1 77.6C4.9 74.8 2.2 67.5 5 61.2l7.8-17c5.7-12.5 24.5-7.8 23.6 5.9l-.1 1.6Z" fill="#00BEFD" />
      <path d="M59.6 43.6a15 15 0 0 0-7.7-2.8l-9.3-.1c-12.6-.1-17-16.8-6.1-23.1L53 8.1c5.9-3.4 13.5-1.4 16.9 4.5l9.4 16.2c6.9 11.9-7.8 24.5-18.5 15.8l-1.2-1Z" fill="#D5FF00" />
    </svg>
  );
}

const LIME = "#D5FF00", CYAN = "#00BEFD", GREEN = "#8EC180";

const FAQ: { q: string; a: string }[] = [
  { q: "Что такое Контент-завод и чем он отличается от обычных нейросетей?", a: "Это готовая система, а не чат. Вы один раз описываете бренд: чем занимаетесь, для кого, каким тоном говорите, какие цвета и логотип. Дальше сервис сам придумывает темы, пишет тексты в голосе бренда, оформляет карусели и картинки в ваших цветах, ставит всё в расписание и публикует. В чате с нейросетью вы каждый раз пишете запрос, копируете текст и вручную выкладываете." },
  { q: "Куда можно публиковать?", a: "В Telegram-каналы, сообщества VK и каналы MAX, а также на сайт на WordPress. Для остальных площадок есть webhook: он передаёт готовый пост и картинки в n8n или Make, а оттуда вы направляете их куда угодно." },
  { q: "Нужно ли мне что-то писать и придумывать самому?", a: "Нет. Достаточно описать бренд. Идеи, тексты, заголовки и оформление карусели сервис делает сам. Каждый материал вы можете одобрить, отредактировать или отклонить. Если хотите полную автоматизацию, включите автопилот: он сам соберёт идеи и напишет черновики, а решение о публикации остаётся за вами." },
  { q: "Сколько это стоит?", a: "Вы платите только за созданный контент, абонемента нет. Пост стоит от 20 ₽, карусель-картинки 35 ₽, картинка к посту 15 ₽, SEO-статья 40 ₽. При регистрации на счёт зачисляется 100 ₽, этого хватит на первые материалы. Если генерация не удалась, деньги возвращаются автоматически." },
  { q: "Тексты не будут похожи на безликий ИИ?", a: "Сервис пишет в тоне вашего бренда и учитывает аудиторию, запретные темы, примеры ваших постов, ссылки и призывы к действию. Вы выбираете тип постов (новости, экспертные, продающие, юмор и другие), длину, эмодзи и хештеги. Чем точнее описан бренд, тем более «вашим» получается текст." },
  { q: "Можно ли вести несколько брендов или проектов?", a: "Да. В одной организации можно создать любое число брендов и контент-заводов, у каждого свой стиль, каналы и расписание. Для агентств доступна команда с ролями: администратор, редактор, наблюдатель." },
  { q: "Как устроены карусели?", a: "Сервис сам придумывает структуру из 4–10 слайдов и собирает готовые картинки в стилях бренда (фирменный, светлый, тёмный). Для обложки можно добавить фон, созданный нейросетью. Карусель публикуется альбомом в Telegram и несколькими фото во VK или MAX. Её также можно скачать архивом." },
  { q: "Безопасно ли подключать каналы?", a: "Ключи доступа к каналам хранятся в зашифрованном виде (AES-256-GCM) и не показываются после сохранения. Публикация идёт только в те каналы, которые вы сами подключили. Данные защищены в соответствии с политикой конфиденциальности." },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "Контент-завод", url: SITE, logo: `${SITE}/logo-light.svg` },
    { "@type": "SoftwareApplication", name: "Контент-завод", applicationCategory: "BusinessApplication", operatingSystem: "Web", description: DESC, url: SITE,
      offers: { "@type": "Offer", price: "0", priceCurrency: "RUB", description: "100 ₽ на счёте при регистрации, далее оплата за созданный контент" } },
    { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

const btnPrimary = "inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-semibold text-[#14161a] shadow-[0_8px_30px_-8px_rgba(213,255,0,.7)] transition hover:-translate-y-0.5 hover:brightness-95";
const btnGhost = "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-6 text-[15px] font-semibold text-ink transition hover:bg-tile";
const wrap = "mx-auto w-full max-w-6xl px-5";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-accent-ink">{children}</p>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-[2.6rem]">{children}</h2>;
}

export default function Landing() {
  return (
    <div className="lt-light overflow-x-clip bg-[var(--bg)] text-[var(--ink)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Шапка */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl">
        <div className={`${wrap} flex h-16 items-center justify-between gap-4`}>
          <div className="w-28 shrink-0 sm:w-36"><Logo href="/" light className="[&_img]:h-8" /></div>
          <nav aria-label="Разделы" className="hidden items-center gap-7 text-sm font-medium text-ink2 lg:flex">
            <a href="#how" className="hover:text-ink">Как работает</a>
            <a href="#features" className="hover:text-ink">Возможности</a>
            <a href="#compare" className="hover:text-ink">Сравнение</a>
            <a href="#pricing" className="hover:text-ink">Цены</a>
            <a href="#faq" className="hover:text-ink">Вопросы</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden h-10 items-center rounded-xl px-4 text-sm font-semibold text-ink hover:bg-tile sm:inline-flex">Войти</Link>
            <Link href="/register" className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-[#14161a]" style={{ background: LIME }}>Начать бесплатно</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-2 mt-2 overflow-hidden rounded-[2rem] sm:mx-3 sm:rounded-[2.5rem]" style={{ background: "linear-gradient(180deg, #f6ffc7 0%, #eefadf 55%, #e3f6fe 100%)" }}>
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <Blobs className="absolute -right-24 -top-16 h-[34rem] w-[34rem] rotate-12 opacity-[.16]" />
            <Blobs className="absolute -bottom-32 -left-28 h-[26rem] w-[26rem] -rotate-12 opacity-[.12]" />
          </div>
          <div className={`${wrap} relative grid items-center gap-12 pb-10 pt-12 md:pt-20 lg:grid-cols-[1.05fr_.95fr]`}>
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-1.5 text-xs font-semibold text-ink2 backdrop-blur">
                <span className="h-2 w-2 rounded-full" style={{ background: GREEN }} />Автоматический контент для бизнеса
              </span>
              <h1 className="mt-5 text-balance text-[2.4rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
                Контент для соцсетей и сайта — <span className="lt-grad-text">на автопилоте</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink2">
                Опишите бренд один раз. Контент-завод сам придумает темы, напишет посты, соберёт карусели и картинки в ваших цветах и опубликует в Telegram, VK и MAX. Вам остаётся нажать «Одобрить».
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/register" className={btnPrimary} style={{ background: LIME }}>Начать бесплатно — 100 ₽ в подарок<ArrowRight size={18} /></Link>
                <a href="#how" className={btnGhost}>Как это работает</a>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink2">
                {["Без банковской карты", "Первый пост за 5 минут", "Посты от 20 ₽, без абонемента"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check size={16} className="text-good" />{t}</li>
                ))}
              </ul>
            </div>

            {/* Визуал: веер каруселей и карточки статуса */}
            <div className="relative mx-auto h-[30rem] w-full max-w-md sm:h-[34rem]" aria-hidden>
              <div className="lt-float absolute left-0 top-10 w-[46%] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-black/10" style={{ ["--r" as string]: "-7deg", animationDelay: "-2s" }}>
                <Image src="/demo/b3.jpg" alt="" width={540} height={675} className="h-auto w-full" priority />
              </div>
              <div className="lt-float absolute right-0 top-0 w-[50%] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-black/10" style={{ ["--r" as string]: "5deg" }}>
                <Image src="/demo/b1.jpg" alt="" width={540} height={675} className="h-auto w-full" priority />
              </div>
              <div className="lt-float absolute bottom-6 left-[18%] w-[52%] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-black/10" style={{ ["--r" as string]: "-2deg", animationDelay: "-4s" }}>
                <Image src="/demo/b4.jpg" alt="" width={540} height={675} className="h-auto w-full" />
              </div>
              <div className="absolute -left-2 bottom-2 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-xl sm:-left-6">
                <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: "#e6f4fb" }}><Send size={17} color="#029cda" /></span>
                <div><p className="text-xs font-semibold">Опубликовано в Telegram</p><p className="text-[11px] text-ink2">Карусель · 6 слайдов · 10:00</p></div>
              </div>
              <div className="absolute -right-1 top-[46%] flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-xl sm:-right-4">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-good-soft"><CalendarDays size={17} className="text-good" /></span>
                <div><p className="text-xs font-semibold">План на месяц готов</p><p className="text-[11px] text-ink2">30 идей за 1 минуту</p></div>
              </div>
            </div>
          </div>
          <div className={`${wrap} relative pb-10 md:pb-14`}>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["1 минута", "на контент-план месяца"],
                ["от 20 ₽", "стоимость готового поста"],
                ["4–10 слайдов", "карусель-картинки за 35 ₽"],
                ["3 площадки", "Telegram, VK и MAX в один клик"],
              ].map(([n, d]) => (
                <li key={n} className="rounded-3xl p-5 text-[#14161a] shadow-[0_10px_30px_-18px_rgba(120,150,0,.6)]" style={{ background: LIME }}>
                  <p className="text-2xl font-extrabold tracking-tight sm:text-3xl">{n}</p>
                  <p className="mt-1.5 text-[13px] font-medium leading-snug opacity-80 sm:text-sm">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Проблема → решение */}
        <section className="py-20 md:py-28">
          <div className={wrap}>
            <Eyebrow>Знакомо?</Eyebrow>
            <H2>Соцсети нужны каждый день, а времени на них нет</H2>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-line bg-tile/60 p-7">
                <p className="mb-5 flex items-center gap-2 text-sm font-semibold text-bad"><X size={16} />Как обычно</p>
                <ul className="space-y-3.5 text-[15px] text-ink2">
                  {["Часами ищете темы и придумываете заголовки", "Тексты получаются то сухими, то не в стиле бренда", "Картинки и карусели делаете в редакторе вручную", "Канал замолкает, как только появляются срочные дела", "SMM-специалист или агентство стоят десятки тысяч в месяц"].map((t) => (
                    <li key={t} className="flex gap-3"><X size={17} className="mt-0.5 shrink-0 text-bad/70" />{t}</li>
                  ))}
                </ul>
              </div>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-7 shadow-sm">
                <div aria-hidden className="absolute -right-16 -top-16 h-52 w-52 rounded-full opacity-30 blur-2xl" style={{ background: LIME }} />
                <p className="relative mb-5 flex items-center gap-2 text-sm font-semibold text-good"><Sparkles size={16} />С Контент-заводом</p>
                <ul className="relative space-y-3.5 text-[15px]">
                  {["План публикаций на месяц собирается за минуту", "Каждый текст написан тоном вашего бренда", "Карусели и картинки оформлены в ваших цветах и с логотипом", "Контент выходит по расписанию, даже когда вы заняты", "Месяц постов и каруселей стоит как обед, а не как зарплата"].map((t) => (
                    <li key={t} className="flex gap-3"><Check size={17} className="mt-0.5 shrink-0 text-good" />{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Как работает */}
        <section id="how" className="bg-tile/60 py-20 md:py-28">
          <div className={wrap}>
            <Eyebrow>Как это работает</Eyebrow>
            <H2>От описания бренда до публикации — четыре шага</H2>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { i: Palette, t: "Опишите бренд", d: "Название, продукт, аудитория, тон общения, цвета и логотип. Это делается один раз и занимает пять минут." },
                { i: CalendarDays, t: "Получите контент-план", d: "Сервис предложит темы и форматы на неделю или месяц. Лишнее уберите, нужное оставьте." },
                { i: Sparkles, t: "Одобрите материалы", d: "Тексты, карусели и картинки готовы. Правьте любую деталь, а правки слайдов бесплатны." },
                { i: Send, t: "Публикация по расписанию", d: "Посты выходят в Telegram, VK и MAX в лучшее время. Если что-то пошло не так, деньги возвращаются." },
              ].map((s, n) => (
                <li key={s.t} className="relative rounded-3xl p-6" style={{ background: ["var(--pastel-cyan)", "var(--pastel-lime)", "var(--pastel-green)", "var(--pastel-cyan)"][n] }}>
                  <span className="mb-5 flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl text-[#14161a]" style={{ background: [CYAN, LIME, GREEN, CYAN][n] }}><s.i size={21} /></span>
                    <span className="text-3xl font-extrabold text-ink3/50">0{n + 1}</span>
                  </span>
                  <h3 className="text-lg font-bold">{s.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink2">{s.d}</p>
                </li>
              ))}
            </ol>
            <div className="mt-10 text-center"><Link href="/register" className={btnPrimary} style={{ background: LIME }}>Собрать первый контент-план<ArrowRight size={18} /></Link></div>
          </div>
        </section>

        {/* Возможности */}
        <section id="features" className="py-20 md:py-28">
          <div className={wrap}>
            <Eyebrow>Возможности</Eyebrow>
            <H2>Всё, что нужно для регулярного контента, в одном окне</H2>
            <div className="mt-12 grid gap-4 md:grid-cols-6">
              {/* Карусели — крупная карточка */}
              <article className="relative overflow-hidden rounded-3xl p-7 md:col-span-4" style={{ background: "var(--pastel-cyan)" }}>
                <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
                  <div>
                    <span className="mb-4 grid h-11 w-11 place-items-center rounded-2xl text-[#14161a]" style={{ background: CYAN }}><GalleryHorizontal size={21} /></span>
                    <h3 className="text-2xl font-bold">Карусели, которые листают до конца</h3>
                    <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink2">Сервис придумывает структуру, пишет текст каждого слайда и сразу собирает готовые картинки: обложка, нумерованные шаги, финальный призыв. Три стиля, ваши цвета, логотип. 35 ₽ за карусель.</p>
                    <ul className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                      {["4–10 слайдов", "Квадрат и 4:5", "Обложка от нейросети", "Скачать архивом"].map((t) => <li key={t} className="rounded-full bg-tile px-3 py-1.5 text-ink2">{t}</li>)}
                    </ul>
                  </div>
                  <div className="flex gap-3 sm:w-64">
                    <Image src="/demo/b2.jpg" alt="Пример слайда карусели в фирменных цветах" width={270} height={338} className="w-1/2 rounded-2xl ring-1 ring-black/10 sm:w-32" loading="lazy" />
                    <Image src="/demo/d3.jpg" alt="Пример слайда карусели в тёмном стиле" width={270} height={338} className="mt-6 w-1/2 rounded-2xl ring-1 ring-black/10 sm:w-32" loading="lazy" />
                  </div>
                </div>
              </article>

              <article className="rounded-3xl p-7 md:col-span-2" style={{ background: "var(--pastel-lime)" }}>
                <span className="mb-4 grid h-11 w-11 place-items-center rounded-2xl text-[#14161a]" style={{ background: LIME }}><CalendarDays size={21} /></span>
                <h3 className="text-xl font-bold">Контент-план на месяц</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink2">Идеи с учётом ниши, типов постов и дат. Календарь публикаций и подбор лучшего времени выхода.</p>
              </article>

              {[
                { i: FileText, c: GREEN, t: "Посты в голосе бренда", d: "Новости, экспертные, продающие, юмор: выбираете тип, длину, эмодзи, хештеги и добавляете примеры своего стиля." },
                { i: ImageIcon, c: CYAN, t: "Картинки к постам", d: "Изображения в стиле бренда по референсам, продуктам и цветам. Одна картинка — 15 ₽." },
                { i: Layers, c: LIME, t: "SEO-статьи для сайта", d: "Структурированные статьи с заголовками и метаданными, публикация прямо в WordPress." },
                { i: Radar, c: CYAN, t: "Мониторинг и идеи", d: "Следим за новостями, каналами VK и Telegram, сайтами и ключевыми словами. Находки превращаются в темы." },
                { i: BarChart3, c: GREEN, t: "Аналитика", d: "Что вышло, что сработало, в какое время лучше публиковать. Решения на данных, а не на ощущениях." },
                { i: Bot, c: LIME, t: "Автопилот и помощник Лия", d: "Автопилот сам собирает идеи и пишет черновики. Помощник отвечает на вопросы по сервису." },
              ].map((f, n) => (
                <article key={f.t} className="rounded-3xl p-7 md:col-span-2" style={{ background: ["var(--pastel-green)", "var(--pastel-cyan)", "var(--pastel-lime)", "var(--pastel-cyan)", "var(--pastel-lime)", "var(--pastel-green)"][n] }}>
                  <span className="mb-4 grid h-11 w-11 place-items-center rounded-2xl text-[#14161a]" style={{ background: f.c }}><f.i size={21} /></span>
                  <h3 className="text-xl font-bold">{f.t}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink2">{f.d}</p>
                </article>
              ))}
              <article className="relative overflow-hidden rounded-3xl p-7 md:col-span-6" style={{ background: "var(--pastel-green)" }}>
                <div className="grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl text-[#14161a]" style={{ background: GREEN }}><Users size={21} /></span>
                  <div><h3 className="text-xl font-bold">Много брендов, команда и роли</h3><p className="mt-1.5 max-w-2xl text-[15px] text-ink2">Любое число брендов и контент-заводов в одной организации, у каждого свой стиль и каналы. Приглашайте сотрудников и клиентов с ролями «администратор», «редактор», «наблюдатель».</p></div>
                  <Link href="/register" className={btnGhost}>Попробовать</Link>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Уникальность / сравнение */}
        <section id="compare" className="bg-tile/60 py-20 md:py-28">
          <div className={wrap}>
            <Eyebrow>Почему не просто чат с нейросетью</Eyebrow>
            <H2>Не текст «на выходе», а готовый процесс «от идеи до публикации»</H2>
            <p className="mt-4 max-w-2xl text-lg text-ink2">Нейросеть в чате пишет текст. Контент-завод ведёт ваши соцсети: планирует, оформляет, публикует и считает результат.</p>
            <div className="mt-10 overflow-x-auto rounded-3xl border border-line bg-surface">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink2">
                    <th className="p-4 font-medium" />
                    <th className="p-4 text-base font-bold text-ink"><span className="rounded-lg px-2.5 py-1 text-[#14161a]" style={{ background: LIME }}>Контент-завод</span></th>
                    <th className="p-4 font-semibold">Чат с нейросетью</th>
                    <th className="p-4 font-semibold">SMM-специалист</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Контент-план на месяц", true, false, true],
                    ["Тон и стиль вашего бренда в каждом тексте", true, "нужно каждый раз объяснять", true],
                    ["Готовые карусели и картинки в цветах бренда", true, false, "зависит от дизайнера"],
                    ["Автоматическая публикация по расписанию", true, false, "вручную"],
                    ["Мониторинг новостей и идей из источников", true, false, "частично"],
                    ["Скорость", "минуты", "минуты, но всё вручную", "дни"],
                    ["Стоимость месяца контента", "около 900 ₽", "подписка + ваше время", "от десятков тысяч ₽"],
                  ] as [string, boolean | string, boolean | string, boolean | string][]).map((r) => (
                    <tr key={r[0]} className="border-b border-line last:border-0">
                      <th scope="row" className="p-4 font-medium">{r[0]}</th>
                      {r.slice(1).map((v, i) => (
                        <td key={i} className={`p-4 ${i === 0 ? "bg-accent-soft/50 font-semibold" : "text-ink2"}`}>
                          {v === true ? <Check size={19} className="text-good" /> : v === false ? <X size={19} className="text-bad/70" /> : v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Контроль и гарантии */}
        <section className="py-20 md:py-28">
          <div className={wrap}>
            <Eyebrow>Вы всегда у руля</Eyebrow>
            <H2>Автоматизация без потери контроля</H2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                { i: ShieldCheck, t: "Публикация только с вашего «да»", d: "Автопилот собирает идеи и пишет черновики, а выходит в канал только то, что вы одобрили." },
                { i: Wallet, t: "Платите за результат", d: "Нет абонемента. Если генерация не удалась, списанные деньги автоматически возвращаются на счёт." },
                { i: Zap, t: "Ключи под замком", d: "Доступы к каналам хранятся в зашифрованном виде и не показываются после сохранения." },
              ].map((b, n) => (
                <div key={b.t} className="rounded-3xl p-7" style={{ background: ["var(--pastel-lime)", "var(--pastel-cyan)", "var(--pastel-green)"][n] }}>
                  <b.i size={26} className="text-accent-ink" />
                  <h3 className="mt-4 text-lg font-bold">{b.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink2">{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Для кого */}
        <section className="bg-tile/60 py-20 md:py-28">
          <div className={wrap}>
            <Eyebrow>Для кого</Eyebrow>
            <H2>Если у вас есть бизнес или экспертность, но нет времени на контент</H2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { i: Store, t: "Малый бизнес и магазины", d: "Регулярные посты о товарах, акциях и пользе, без найма SMM-специалиста." },
                { i: UserRound, t: "Эксперты и блогеры", d: "Ваш голос и ваши идеи, а рутину оформления и публикации берёт на себя сервис." },
                { i: Briefcase, t: "Агентства и фрилансеры", d: "Ведите десятки клиентов в одном окне и берите больше проектов без роста штата." },
                { i: Building2, t: "Компании и команды", d: "Единый стиль всех каналов, роли для сотрудников и контроль каждого материала." },
              ].map((w, n) => (
                <div key={w.t} className="rounded-3xl p-6" style={{ background: ["var(--pastel-cyan)", "var(--pastel-lime)", "var(--pastel-green)", "var(--pastel-cyan)"][n] }}>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-accent-ink"><w.i size={21} /></span>
                  <h3 className="mt-4 text-lg font-bold">{w.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink2">{w.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Цены */}
        <section id="pricing" className="py-20 md:py-28">
          <div className={wrap}>
            <Eyebrow>Цены</Eyebrow>
            <H2>Платите только за созданный контент</H2>
            <p className="mt-4 max-w-2xl text-lg text-ink2">Без абонемента и скрытых платежей. При регистрации на счёте уже 100 ₽, этого хватит на первый контент.</p>
            <div className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
              <div className="rounded-3xl border border-line bg-surface p-3 sm:p-4">
                <ul className="divide-y divide-line">
                  {[
                    { i: FileText, n: "Пост для соцсетей", p: "20 ₽" },
                    { i: GalleryHorizontal, n: "Карусель-картинки (4–10 слайдов)", p: "35 ₽" },
                    { i: ImageIcon, n: "Картинка к посту", p: "15 ₽" },
                    { i: Layers, n: "SEO-статья для сайта", p: "40 ₽" },
                    { i: Sparkles, n: "Идея для контент-плана", p: "3 ₽" },
                    { i: Megaphone, n: "Правка слайдов карусели", p: "бесплатно" },
                  ].map((r) => (
                    <li key={r.n} className="flex items-center gap-4 px-3 py-3.5 sm:px-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tile text-ink2"><r.i size={19} /></span>
                      <span className="flex-1 text-[15px] font-medium">{r.n}</span>
                      <span className="text-base font-bold">{r.p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative overflow-hidden rounded-3xl p-8 text-[#14161a]" style={{ background: `linear-gradient(145deg, ${CYAN}, ${GREEN} 60%, ${LIME})` }}>
                <Blobs className="absolute -right-10 -top-10 h-44 w-44 rotate-12 opacity-40 [filter:saturate(.5)_brightness(1.5)]" /><p className="relative text-sm font-semibold opacity-80">Пример: контент на месяц</p>
                <p className="mt-3 text-5xl font-extrabold tracking-tight">≈ 900 ₽</p>
                <p className="mt-3 text-[15px] font-medium leading-relaxed">30 постов и 8 каруселей. Это примерно стоимость обеда, а не месячной ставки SMM-специалиста.</p>
                <Link href="/register" className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#14161a] px-6 text-[15px] font-semibold text-white transition hover:opacity-90">Получить 100 ₽ и начать<ArrowRight size={18} /></Link>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium opacity-80"><Clock size={14} />Регистрация занимает минуту</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-tile/60 py-20 md:py-28">
          <div className={`${wrap} grid gap-10 lg:grid-cols-[.8fr_1.2fr]`}>
            <div><Eyebrow>Вопросы</Eyebrow><H2>Частые вопросы</H2><p className="mt-4 text-ink2">Не нашли ответ? Зарегистрируйтесь: помощник Лия внутри сервиса подскажет по любому вопросу.</p></div>
            <div className="space-y-3">
              {FAQ.map((f) => (
                <details key={f.q} className="lt-faq group rounded-2xl border border-line bg-surface px-5 py-4">
                  <summary className="flex items-center justify-between gap-4 text-[15px] font-semibold">
                    {f.q}<Plus size={20} className="lt-plus shrink-0 text-ink2 transition-transform" />
                  </summary>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Финальный призыв */}
        <section className="px-5 py-16 md:py-24">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-14 text-center text-[#14161a] sm:px-12 md:py-20" style={{ background: `linear-gradient(120deg, ${CYAN} 0%, ${GREEN} 55%, ${LIME} 100%)` }}>
            <Blobs className="absolute -right-16 -top-20 h-80 w-80 rotate-12 opacity-30 [filter:saturate(.4)_brightness(1.4)]" /><Blobs className="absolute -bottom-24 -left-16 h-72 w-72 -rotate-12 opacity-25 [filter:saturate(.4)_brightness(1.4)]" />
            <h2 className="relative mx-auto max-w-3xl text-balance text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">Запустите контент-завод для своего бренда сегодня</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-lg font-medium">100 ₽ в подарок, чтобы убедиться самому. Первый пост — через пять минут.</p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-[#14161a] px-8 py-3.5 text-base font-semibold text-white transition hover:-translate-y-0.5">Начать бесплатно<ArrowRight size={18} /></Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-2xl px-6 py-3.5 text-base font-semibold underline-offset-4 hover:underline">У меня уже есть аккаунт</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={`${wrap} flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between`}>
          <div className="max-w-xs">
            <div className="w-36"><Logo href="/" light className="[&_img]:h-8" /></div>
            <p className="mt-3 text-sm text-ink2">Автоматический контент для соцсетей и сайта: план, тексты, карусели, публикация.</p>
          </div>
          <nav aria-label="Навигация" className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink2">
            <a href="#how" className="hover:text-ink">Как работает</a><a href="#features" className="hover:text-ink">Возможности</a><a href="#pricing" className="hover:text-ink">Цены</a><a href="#faq" className="hover:text-ink">Вопросы</a>
            <Link href="/login" className="hover:text-ink">Войти</Link><Link href="/register" className="hover:text-ink">Регистрация</Link>
          </nav>
        </div>
        <div className={`${wrap} flex flex-col gap-3 border-t border-line py-6 md:flex-row md:items-center md:justify-between`}>
          <LegalLinks />
          <p className="text-xs text-ink3">© {new Date().getFullYear()} Контент-завод</p>
        </div>
      </footer>
    </div>
  );
}
