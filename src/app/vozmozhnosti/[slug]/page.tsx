import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { MARKETING_UPDATED, PRODUCT_PAGES, productPage } from "@/lib/marketing-content";
import { jsonLdText, productEntities, publicMetadata } from "@/lib/public-seo";
import { SITE } from "@/lib/site";

export const dynamicParams = false;
export function generateStaticParams() { return PRODUCT_PAGES.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const page = productPage((await params).slug);
  if (!page) notFound();
  return publicMetadata(page.title, page.description, `/vozmozhnosti/${page.slug}`);
}
const illustrations: Record<string, { src: string; alt: string }> = {
  "generator-postov": { src: "/landing/step-3.webp", alt: "Иллюстрация подготовки и редактирования материалов в JuicerAI" },
  "kontent-plan": { src: "/landing/step-2.webp", alt: "Иллюстрация контент-плана и тем публикаций" },
  avtoposting: { src: "/landing/step-4.webp", alt: "Иллюстрация публикации готового контента в каналах" },
};
export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
  const page = productPage((await params).slug);
  if (!page) notFound();
  const url = `${SITE}/vozmozhnosti/${page.slug}`;
  const illustration = illustrations[page.slug];
  const schema = { "@context": "https://schema.org", "@graph": [
    ...productEntities(),
    { "@type": "WebPage", "@id": `${url}#page`, url, name: page.title, description: page.description, inLanguage: "ru-RU", dateModified: MARKETING_UPDATED, isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": `${SITE}/#software` }, publisher: { "@id": `${SITE}/#organization` } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Главная", item: SITE }, { "@type": "ListItem", position: 2, name: "Возможности", item: `${SITE}/vozmozhnosti` }, { "@type": "ListItem", position: 3, name: page.label, item: url }] },
    { "@type": "FAQPage", mainEntity: page.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ] };
  return <main className="mx-auto max-w-[1360px] px-5">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(schema) }} />
    <nav aria-label="Хлебные крошки" className="flex flex-wrap gap-2 pt-8 text-sm text-neutral-600"><Link href="/" className="hover:underline">Главная</Link><span aria-hidden>/</span><Link href="/vozmozhnosti" className="hover:underline">Возможности</Link><span aria-hidden>/</span><span aria-current="page">{page.label}</span></nav>
    <section className="grid items-center gap-8 py-12 md:grid-cols-[1.35fr_1fr] md:py-20">
      <div><p className="mb-5 font-semibold text-[#0070F0]">JuicerAI · {page.label}</p><h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight md:text-6xl">{page.heading}</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-600">{page.intro}</p><Link href="/" className="mt-8 inline-flex items-center gap-3 rounded-full bg-[#0070F0] px-7 py-4 font-semibold text-white hover:bg-[#005dcc]">Познакомиться с JuicerAI <ArrowRight size={20} /></Link></div>
      <div className="flex aspect-square items-center justify-center rounded-[32px] bg-[#f5f5f5] p-8"><Image src={illustration.src} alt={illustration.alt} width={560} height={560} priority className="h-auto max-h-full w-full object-contain" /></div>
    </section>
    <div className="grid gap-8 rounded-[28px] bg-[#f5f5f5] p-6 md:grid-cols-2 md:p-10"><div><h2 className="text-xl font-semibold">Что вы получаете</h2><p className="mt-3 leading-relaxed text-neutral-600">{page.result}</p></div><div><h2 className="text-xl font-semibold">Кому подойдёт</h2><p className="mt-3 leading-relaxed text-neutral-600">{page.audience}</p></div></div>
    <div className="mt-14 grid items-start gap-12 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="rounded-3xl bg-[#f5f5f5] p-6 lg:sticky lg:top-6"><nav aria-label="Содержание страницы"><p className="mb-4 font-semibold">На этой странице</p><ul className="space-y-4 text-sm leading-relaxed">{page.sections.map(s => <li key={s.id}><a href={`#${s.id}`} className="text-neutral-600 hover:text-[#0070F0]">{s.title}</a></li>)}<li><a href="#example">Пример сценария</a></li><li><a href="#faq">Вопросы и ответы</a></li></ul></nav></aside>
      <article className="max-w-[780px]">
        {page.sections.map(section => <section key={section.id} id={section.id} className="mb-14 scroll-mt-8"><h2 className="mb-5 text-2xl font-semibold leading-tight md:text-3xl">{section.title}</h2>{section.paragraphs.map(p => <p key={p} className="mb-5 text-lg leading-relaxed text-neutral-600">{p}</p>)}{section.items && <ul className="list-disc space-y-3 pl-6 text-lg leading-relaxed text-neutral-600">{section.items.map(item => <li key={item}>{item}</li>)}</ul>}</section>)}
        <section id="example" className="mb-14 scroll-mt-8 rounded-[28px] bg-[#e7f2ff] p-6 md:p-9"><p className="mb-3 text-sm font-semibold text-[#005dcc]">Пример сценария</p><h2 className="text-2xl font-semibold">{page.example.title}</h2><p className="mt-5 leading-relaxed">{page.example.context}</p><p className="mt-5 whitespace-pre-line leading-relaxed">{page.example.text}</p><p className="mt-5 text-sm leading-relaxed text-neutral-600">{page.example.note}</p></section>
        <section id="faq" className="scroll-mt-8"><h2 className="mb-6 text-3xl font-semibold">Вопросы и ответы</h2>{page.faq.map(f => <details key={f.q} className="mb-3 rounded-2xl bg-[#f5f5f5] p-6"><summary className="cursor-pointer text-lg font-semibold">{f.q}</summary><p className="mt-4 leading-relaxed text-neutral-600">{f.a}</p></details>)}</section>
        <p className="mt-8 text-sm text-neutral-500">Подготовлено командой JuicerAI · Обновлено <time dateTime={MARKETING_UPDATED}>24 ноября 2026</time></p>
      </article>
    </div>
    <section className="mt-20"><h2 className="text-3xl font-semibold">Другие возможности</h2><div className="mt-6 grid gap-4 md:grid-cols-2">{PRODUCT_PAGES.filter(p => p.slug !== page.slug).map(p => <Link key={p.slug} href={`/vozmozhnosti/${p.slug}`} className="group rounded-3xl bg-[#f5f5f5] p-7 hover:bg-[#e7f2ff]"><h3 className="text-xl font-semibold">{p.label} <span aria-hidden className="text-[#0070F0]">↗</span></h3><p className="mt-3 leading-relaxed text-neutral-600">{p.description}</p></Link>)}</div></section>
    <section className="mt-16 rounded-[32px] bg-[#0070F0] px-6 py-12 text-center text-white md:p-14"><h2 className="text-3xl font-semibold md:text-4xl">От идеи до публикации с JuicerAI</h2><p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed">Посмотрите все возможности контент-завода, примеры материалов и актуальные тарифы на главной странице.</p><Link href="/" className="mt-7 inline-flex rounded-full bg-white px-8 py-4 font-semibold text-black hover:bg-[#e7f2ff]">Перейти на главную</Link></section>
  </main>;
}
