import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check, Plus, X, Sparkles, FileText, GalleryHorizontal, ImageIcon, Layers, Megaphone } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Rail } from "@/components/landing/Rail";
import { CardVideo } from "@/components/landing/CardVideo";
import { HeroVideo } from "@/components/landing/HeroVideo";
import { Audience } from "@/components/landing/Audience";
import { hasMedia } from "@/lib/landing-media";
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


const wrap = "mx-auto w-full max-w-[1360px] px-5";
const h2 = "text-balance text-center text-3xl font-semibold leading-tight md:text-5xl md:leading-[48px]";
const BLUE = "#1734fc";

const BAD = ["Часами ищете темы и придумываете заголовки", "Тексты получаются то сухими, то не в стиле бренда", "Картинки и карусели делаете в редакторе вручную", "Канал замолкает, как только появляются срочные дела", "SMM-специалист или агентство стоят десятки тысяч в месяц"];
const GOOD = ["План публикаций на месяц собирается за минуту", "Каждый текст написан тоном вашего бренда", "Карусели и картинки оформлены в ваших цветах и с логотипом", "Контент выходит по расписанию, даже когда вы заняты", "Месяц постов и каруселей стоит как обед, а не как зарплата"];

const STEPS = [
  { img: "/landing/step-1.webp", w: 1.156, t: "Регистрируйтесь в сервисе и опишите бренд", d: "Название, продукт, аудитория, тон общения, цвета и логотип. Это делается один раз и занимает пять минут." },
  { img: "/landing/step-2.webp", w: 1.043, t: "Получите контент-план", d: "Сервис предложит темы и форматы на неделю или месяц. Лишнее уберите, нужное оставьте." },
  { img: "/landing/step-3.webp", w: 1.174, t: "Одобрите материалы", d: "Тексты, карусели и картинки готовы. Правьте любую деталь, а правки слайдов бесплатны." },
  { img: "/landing/step-4.webp", w: 0.908, t: "Публикуйте по расписанию", d: "Посты выходят в Telegram, VK и MAX в лучшее время. Если что-то пошло не так, деньги возвращаются." },
];

const AUDIENCE = [
  { title: "Малый бизнес и магазины", text: "Регулярные посты о товарах, акциях и пользе, без найма SMM-специалиста.", img: "/landing/aud-1.webp", ratio: 1.016 },
  { title: "Эксперты и блогеры", text: "Ваш голос и ваши идеи, а рутину оформления и публикации берёт на себя сервис.", img: "/landing/aud-2.webp", ratio: 1.025 },
  { title: "Компании и команды", text: "Единый стиль всех каналов, роли для сотрудников и контроль каждого материала.", img: "/landing/aud-3.webp", ratio: 1.063 },
  { title: "Агентства и фрилансеры", text: "Ведите десятки клиентов в одном окне и берите больше проектов без роста штата.", img: "/landing/aud-4.webp", ratio: 0.774 },
];

type Tone = "plain" | "blue" | "liquid";
const FEATURES: { key: string; t: string; d: string; tone: Tone; chips?: string[]; time?: [string, string] }[] = [
  { key: "plan", t: "Контент-план на месяц", d: "Идеи с учётом ниши, типов постов и дат. Календарь публикаций и подбор лучшего времени выхода.", tone: "plain", time: ["≈ 4 часа", "≈ 5 минут"] },
  { key: "carousel", t: "Карусели, которые листают до конца", d: "Сервис придумывает структуру, пишет текст каждого слайда и сразу собирает готовые картинки: обложка, нумерованные шаги, финальный призыв. Три стиля, ваши цвета, логотип. 35 ₽ за карусель.", tone: "blue", chips: ["4–10 слайдов", "Квадрат и 4:5", "Обложка от нейросети", "Скачать архивом"], time: ["≈ 5 часов", "≈ 3 минуты"] },
  { key: "posts", t: "Посты в голосе бренда", d: "Новости, экспертные, продающие, юмор: выбираете тип, длину, эмодзи, хештеги и добавляете примеры своего стиля.", tone: "liquid" },
  { key: "images", t: "Картинки к постам", d: "Изображения в стиле бренда по референсам, продуктам и цветам. Одна картинка — 15 ₽.", tone: "plain" },
  { key: "seo", t: "SEO-статьи для сайта", d: "Структурированные статьи с заголовками и метаданными, публикация прямо в WordPress.", tone: "blue" },
  { key: "monitor", t: "Мониторинг и идеи", d: "Следим за новостями, каналами VK и Telegram, сайтами и ключевыми словами. Находки превращаются в темы.", tone: "liquid" },
  { key: "analytics", t: "Аналитика", d: "Что вышло, что сработало, в какое время лучше публиковать. Решения на данных, а не на ощущениях.", tone: "plain" },
  { key: "autopilot", t: "Автопилот и помощник в чате", d: "Автопилот сам собирает идеи и пишет черновики. Ассистент в чате отвечает на вопросы, обновляет новости и подсказывает, где что включить.", tone: "blue" },
  { key: "teams", t: "Много брендов, команда и роли", d: "Любое число брендов и контент-заводов в одной организации, у каждого свой стиль и каналы. Приглашайте сотрудников и клиентов с ролями «администратор», «редактор», «наблюдатель».", tone: "liquid" },
];

const PRICES: { i: typeof FileText; n: string; p: string }[] = [
  { i: FileText, n: "Пост для соцсетей", p: "20 ₽" }, { i: GalleryHorizontal, n: "Карусель-картинки (4–10 слайдов)", p: "35 ₽" }, { i: ImageIcon, n: "Картинка к посту", p: "15 ₽" },
  { i: Layers, n: "SEO-статья для сайта", p: "40 ₽" }, { i: Sparkles, n: "Идея для контент-плана", p: "3 ₽" }, { i: Megaphone, n: "Правка слайдов карусели", p: "бесплатно" },
];

const COMPARE: [string, boolean | string, boolean | string, boolean | string][] = [
  ["Контент-план на месяц", true, false, true],
  ["Тон и стиль вашего бренда в каждом тексте", true, "нужно каждый раз объяснять", true],
  ["Готовые карусели и картинки в цветах бренда", true, false, "зависит от дизайнера"],
  ["Автоматическая публикация по расписанию", true, false, "вручную"],
  ["Мониторинг новостей и идей из источников", true, false, "частично"],
  ["Скорость", "минуты", "минуты, но всё вручную", "дни"],
  ["Стоимость месяца контента", "около 900 ₽", "подписка + ваше время", "от десятков тысяч ₽"],
];

const GUARANTEES = [
  { t: "Публикация только с вашего «да»", d: "Автопилот собирает идеи и пишет черновики, а выходит в канал только то, что вы одобрили." },
  { t: "Платите за результат", d: "Нет абонемента. Если генерация не удалась, списанные деньги автоматически возвращаются на счёт." },
  { t: "Ключи под замком", d: "Доступы к каналам хранятся в зашифрованном виде и не показываются после сохранения." },
];

/** Правая «экранная» часть карточки возможностей: короткая анимация интерфейса (public/landing/gif/<ключ>.mp4, заставка <ключ>.webp). Можно заменить на .gif/.webp. Пока файла нет, чёрный блок. */
function Screen({ k }: { k: string }) {
  const base = `/landing/gif/${k}`;
  const mp4 = hasMedia(`landing/gif/${k}.mp4`), poster = hasMedia(`landing/gif/${k}.webp`) ? `${base}.webp` : undefined, img = ["gif", "webp"].map((e) => `${base}.${e}`).find((p) => hasMedia(p.slice(1)));
  return (
    <div className="relative mx-auto aspect-[516/384] w-full max-w-[516px] overflow-hidden rounded-3xl bg-black xl:mx-0">
      {mp4 ? <CardVideo src={`${base}.mp4`} poster={poster} />
        : img ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt="" className="size-full object-cover" loading="lazy" /> : null}
    </div>
  );
}

function HeroMedia() {
  const d = hasMedia("landing/hero.mp4") ? "/landing/hero.mp4" : undefined, m = hasMedia("landing/hero-mobile.mp4") ? "/landing/hero-mobile.mp4" : undefined;
  const dPoster = d ? "/landing/hero-poster.webp" : "/landing/hero.webp", mPoster = m ? "/landing/hero-mobile-poster.webp" : dPoster;
  return (
    <div className="relative mx-auto mt-10 aspect-[4/3] w-full overflow-hidden rounded-3xl bg-[#2d3cff] md:mt-14 md:aspect-[1360/560]">
      {/* заставка: на телефоне своя картинка 4:3, на компьютере широкая */}
      <Image src={mPoster} alt="" width={1200} height={900} priority className="absolute inset-0 size-full object-cover md:hidden" />
      <Image src={dPoster} alt="" width={1920} height={790} priority className="absolute inset-0 hidden size-full object-cover md:block" />
      <HeroVideo desktop={d} mobile={m} />
    </div>
  );
}

const Mark = ({ ok }: { ok: boolean | string }) => ok === true ? <Check size={19} className="text-green-700" /> : ok === false ? <X size={19} className="text-red-500/70" /> : <>{ok}</>;

export default function Landing() {
  return (
    <div className="lt-light overflow-x-clip bg-white text-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl">
        <div className={`${wrap} flex h-20 items-center justify-between`}>
          <div className="w-32 sm:w-40"><Logo href="/" light h={40} /></div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden h-12 items-center rounded-full px-5 text-base font-semibold hover:bg-[#f5f5f5] sm:inline-flex">Войти</Link>
            <Link href="/register" className="inline-flex h-12 items-center rounded-full bg-[#f5f5f5] px-7 text-base font-semibold hover:bg-[#ececec]">Бесплатно</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className={`${wrap} pt-10 md:pt-14`}>
          <div className="mx-auto flex max-w-[620px] flex-col items-center gap-1 text-center text-[32px] font-semibold leading-[1.1] sm:text-4xl md:text-5xl md:leading-[52px]">
            <h1 className="contents">
              <span className="flex items-end justify-center gap-4 whitespace-nowrap">Контент для <Image src="/landing/icon-pink.png" alt="" width={45} height={45} className="mb-1 size-9 md:size-11" /></span>
              <span className="flex items-center justify-center gap-2 whitespace-nowrap">соц. сетей <Image src="/landing/icon-star.png" alt="" width={50} height={50} className="size-8 md:size-12" /> и сайта</span>
              <span>на автопилоте</span>
            </h1>
          </div>
          <p className="mx-auto mt-8 max-w-xs text-center text-lg font-semibold leading-5">Без VPN и с поддержкой российских банковских карт</p>
          <div className="mt-6 flex justify-center">
            <Link href="/register" className="inline-flex h-14 items-center rounded-xl bg-black px-10 text-lg font-semibold text-white transition hover:opacity-85">Начать бесплатно</Link>
          </div>
          <HeroMedia />
        </section>

        {/* Проблема → решение */}
        <section className="pt-24 md:pt-44">
          <div className={wrap}>
            <h2 className={h2}>Соцсети нужны каждый день, <br className="hidden md:block" />а времени на них нет</h2>
            <div className="mt-12 grid gap-5 md:mt-14 md:grid-cols-2 lg:mx-auto lg:max-w-[1168px]">
              <div className="relative flex flex-col overflow-hidden rounded-[32px] bg-black px-6 pt-14 text-white sm:px-16 md:min-h-[642px]">
                <h3 className="text-center text-3xl font-semibold leading-8">Как обычно</h3>
                <ul className="mt-8 space-y-3">{BAD.map((t) => <li key={t} className="rounded-3xl bg-zinc-800/70 px-6 py-5 text-center text-base font-semibold leading-5 backdrop-blur-[2px]">{t}</li>)}</ul>
                <Image src="/landing/pile.webp" alt="" width={1300} height={721} className="pointer-events-none -mx-6 mt-auto h-auto w-[calc(100%+3rem)] max-w-none pt-8 sm:-mx-16 sm:w-[calc(100%+8rem)]" />
              </div>
              <div className="relative flex flex-col overflow-hidden rounded-[32px] bg-lime-300 px-6 pt-14 text-black sm:px-16 md:min-h-[642px]">
                <h3 className="flex items-center justify-center gap-2.5 text-center text-3xl font-semibold leading-8"><Sparkles size={22} />С Контент-заводом</h3>
                <ul className="mt-8 space-y-3">{GOOD.map((t) => <li key={t} className="rounded-3xl bg-neutral-100 px-6 py-5 text-center text-base font-semibold leading-5">{t}</li>)}</ul>
                <Image src="/landing/order.webp" alt="" width={1100} height={905} className="pointer-events-none -ml-6 mt-auto h-auto w-[78%] max-w-none pt-8 sm:-ml-16" />
              </div>
            </div>
          </div>
        </section>

        {/* Как работает */}
        <section id="how" className="pt-24 md:pt-44">
          <div className={`${wrap} grid gap-10 lg:grid-cols-[1fr_676px] lg:gap-12`}>
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="text-balance text-3xl font-semibold leading-tight md:text-5xl md:leading-[48px]">От описания бренда<br />до публикации <Image src="/landing/icon-steps.png" alt="" width={54} height={40} className="inline-block h-9 w-auto align-middle md:h-10" /><br />всего четыре шага</h2>
            </div>
            <ol className="space-y-5">
              {STEPS.map((s, n) => (
                <li key={s.t} className="relative overflow-hidden rounded-[20px] bg-[#f5f5f5] p-6 sm:px-10 sm:pt-10 md:h-[384px]">
                  <h3 className="text-2xl font-semibold leading-7">{s.t}</h3>
                  <p className="mt-3 max-w-md text-base font-semibold leading-5">{s.d}</p>
                  <Image src={s.img} alt="" width={Math.round(700 * s.w)} height={700} className="mx-auto mt-4 h-[210px] w-auto md:absolute md:bottom-3 md:right-10 md:mx-0 md:mt-0 md:h-[236px]" aria-hidden />
                  <span className="sr-only">Шаг {n + 1}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Кому полезен */}
        <section className="pt-24 md:pt-44">
          <div className={wrap}>
            <h2 className={`${h2} mb-14`}>Кому будет полезен сервис</h2>
            <Audience items={AUDIENCE} />
          </div>
        </section>

        {/* Возможности */}
        <section id="features" className="pt-24 md:pt-44">
          <div className={wrap}>
            <h2 className={`${h2} mx-auto mb-14 max-w-[820px]`}>Всё, что нужно для регулярного контента, в одном окне</h2>
            <Rail label="Возможности" itemsStart>
              {FEATURES.map((f) => {
                const bg = f.tone === "blue" ? "/landing/banner-blue.webp" : f.tone === "liquid" ? "/landing/banner-liquid.webp" : null;
                const light = f.tone !== "blue";
                return (
                  <article key={f.key} className={`relative w-[88vw] max-w-[1360px] shrink-0 snap-start overflow-hidden rounded-[20px] p-6 md:w-full md:p-10 ${f.tone === "plain" ? "bg-[#f5f5f5]" : "bg-[#f5f5f5]"} ${light ? "text-black" : "text-white"}`}>
                    {bg && <Image src={bg} alt="" fill sizes="1360px" className="object-cover" aria-hidden />}
                    <div className="relative grid gap-8 xl:grid-cols-[1fr_516px] xl:gap-12">
                      <div className="flex flex-col">
                        <h3 className="text-2xl font-semibold leading-9 md:text-3xl">{f.t}</h3>
                        <p className="mt-6 max-w-[592px] text-base font-semibold leading-6 xl:mt-14">{f.d}</p>
                        {f.chips && <ul className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">{f.chips.map((c) => <li key={c} className="rounded-full bg-white/20 px-3 py-1.5">{c}</li>)}</ul>}
                        {f.time && (
                          <div className="mt-8 flex flex-wrap gap-x-16 gap-y-4 xl:mt-auto xl:pt-10">
                            <div className={light ? "text-zinc-400" : "text-white/60"}><p className="text-4xl font-semibold leading-10">{f.time[0]}</p><p className={`mt-3 text-base font-semibold ${light ? "text-black" : "text-white"}`}>без помощи ИИ</p></div>
                            <div><p className="text-5xl font-semibold leading-[53px] text-orange-300">{f.time[1]}</p><p className="mt-3 text-base font-semibold">с помощью сервиса</p></div>
                          </div>
                        )}
                      </div>
                      <Screen k={f.key} />
                    </div>
                  </article>
                );
              })}
            </Rail>
          </div>
        </section>

        {/* Сравнение */}
        <section id="compare" className="pt-24 md:pt-44">
          <div className={wrap}>
            <div className="rounded-3xl px-4 pb-10 pt-14 text-center text-white md:px-10 md:pb-16 md:pt-24" style={{ background: "linear-gradient(270deg, #a5b4fc, #4f46e5)" }}>
              <h2 className="mx-auto max-w-[684px] text-balance text-3xl font-semibold leading-tight md:text-5xl md:leading-[48px]">Не текст «на выходе», а готовый процесс «от идеи до публикации»</h2>
              <p className="mx-auto mt-8 max-w-[672px] text-lg font-semibold leading-7">Нейросеть в чате пишет текст. Контент-завод ведёт ваши соцсети: планирует, оформляет, публикует и считает результат.</p>
              <div className="mx-auto mt-12 max-w-[1132px] rounded-[20px] bg-white p-2.5 text-left text-black md:mt-16">
                <div className="overflow-x-auto rounded-3xl outline outline-1 -outline-offset-1 outline-stone-200">
                  <table className="w-full min-w-[680px] border-collapse text-sm font-semibold">
                    <thead><tr className="border-b border-stone-200">
                      <th className="w-[34%] p-4" />
                      <th className="bg-violet-50 p-4"><span className="inline-block rounded-lg bg-indigo-500 px-4 py-0.5 text-base text-white">Контент-завод</span></th>
                      <th className="p-4 text-gray-500">Чат с нейросетью</th>
                      <th className="p-4 text-gray-500">SMM-специалист</th>
                    </tr></thead>
                    <tbody>{COMPARE.map((r) => (
                      <tr key={r[0]} className="border-b border-stone-200 last:border-0">
                        <th scope="row" className="h-14 p-4 text-left text-zinc-900">{r[0]}</th>
                        <td className="bg-violet-50 p-4 text-zinc-900"><Mark ok={r[1]} /></td>
                        <td className="p-4 text-gray-500"><Mark ok={r[2]} /></td>
                        <td className="p-4 text-gray-500"><Mark ok={r[3]} /></td>
                      </tr>))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Гарантии */}
        <section className="pt-24 md:pt-44">
          <div className={wrap}>
            <h2 className={`${h2} mb-12`}>Автоматизация без потери контроля</h2>
            <div className="grid gap-5 md:grid-cols-3">{GUARANTEES.map((g) => (
              <div key={g.t} className="rounded-[20px] bg-[#f5f5f5] p-8"><h3 className="text-2xl font-semibold leading-7">{g.t}</h3><p className="mt-3 text-base font-semibold leading-6 text-zinc-600">{g.d}</p></div>
            ))}</div>
          </div>
        </section>

        {/* Цены */}
        <section id="pricing" className="pt-24 md:pt-44">
          <div className={wrap}>
            <h2 className={`${h2} mb-14`}>Платите только за созданный контент</h2>
            <div className="mx-auto grid max-w-[1170px] gap-5 lg:grid-cols-[599fr_558fr]">
              <div className="rounded-3xl p-4 outline outline-1 -outline-offset-1 outline-zinc-200 sm:p-6" style={{ background: "linear-gradient(270deg, #ecfccb, #84cc16)" }}>
                <ul className="rounded-3xl bg-white/95 p-2 sm:p-4">
                  {PRICES.map((r) => (
                    <li key={r.n} className="flex items-center gap-4 border-b border-stone-200 px-3 py-3.5 last:border-0 sm:px-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-gray-500"><r.i size={19} /></span>
                      <span className="flex-1 text-base font-semibold leading-6 text-zinc-900">{r.n}</span>
                      <span className="text-base font-semibold text-zinc-900">{r.p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col rounded-3xl bg-gradient-to-b from-stone-50 to-zinc-100 px-8 py-10 outline outline-1 -outline-offset-1 outline-zinc-200 sm:px-14">
                <div className="w-40 pb-6"><Logo href="/" light h={44} /></div>
                <p className="text-sm font-semibold leading-5 text-neutral-900/80">Пример: контент на месяц</p>
                <p className="mt-6 text-5xl font-semibold leading-[53px] text-blue-900">≈ 900 руб</p>
                <p className="mt-6 text-base font-semibold leading-6 text-neutral-900">30 постов и 8 каруселей. Это примерно стоимость обеда, а не месячной ставки SMM-специалиста. При регистрации на счёте уже 100 ₽.</p>
                <Link href="/register" className="mt-auto inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-[#1c1c1c] px-8 text-base font-medium text-white transition hover:opacity-85 lg:mt-8">Хочу также</Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="pt-24 md:pt-44">
          <div className={wrap}>
            <h2 className={`${h2} mb-14`}>Часто задаваемые вопросы</h2>
            <div className="mx-auto max-w-[1160px] overflow-hidden rounded-2xl">
              {FAQ.map((f) => (
                <details key={f.q} className="lt-faq group border-b border-white bg-[#f5f5f5] last:border-0">
                  <summary className="flex min-h-20 items-center justify-between gap-4 px-6 py-5 text-base font-semibold leading-6 md:px-[30px] md:text-lg">
                    {f.q}<span className="grid size-8 shrink-0 place-items-center rounded-full bg-white"><Plus size={18} className="lt-plus transition-transform" /></span>
                  </summary>
                  <p className="px-6 pb-6 text-base leading-relaxed text-zinc-600 md:px-[30px] md:pr-20">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Финальный призыв */}
        <section className="pt-24 md:pt-44">
          <div className={wrap}>
            <div className="rounded-3xl px-6 py-14 text-center text-white md:py-20" style={{ background: `linear-gradient(120deg, ${BLUE}, #4f46e5)` }}>
              <h2 className="mx-auto max-w-3xl text-balance text-3xl font-semibold leading-tight md:text-5xl">Запустите контент-завод для своего бренда сегодня</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg font-semibold">100 ₽ в подарок, чтобы убедиться самому. Первый пост — через пять минут.</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/register" className="inline-flex h-14 items-center rounded-xl bg-white px-10 text-lg font-semibold text-black transition hover:opacity-90">Начать бесплатно</Link>
                <Link href="/login" className="inline-flex h-14 items-center px-6 text-base font-semibold underline-offset-4 hover:underline">У меня уже есть аккаунт</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-24 bg-neutral-800 text-white md:mt-36">
        <div className={`${wrap} grid gap-8 py-10 md:grid-cols-2`}>
          <div className="space-y-3">
            <nav aria-label="Документы" className="flex flex-col gap-2 text-sm font-semibold">
              <Link href="/legal/privacy">Политика конфиденциальности</Link>
              <Link href="/legal/terms" className="opacity-80 hover:opacity-100">Пользовательское соглашение</Link>
              <Link href="/legal/cookies" className="opacity-80 hover:opacity-100">Cookie</Link>
            </nav>
            <p className="pt-2 text-xs font-semibold opacity-60">© Контент-завод, {new Date().getFullYear()}</p>
          </div>
          <p className="text-sm font-semibold leading-5 opacity-60 md:max-w-[566px]">Мы используем файлы cookie для персонализации сервисов и повышения удобства пользования сайтом. Если вы не согласны на их использование, поменяйте настройки браузера.</p>
        </div>
      </footer>
    </div>
  );
}
