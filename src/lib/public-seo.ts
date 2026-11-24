import type { Metadata } from "next";
import { SITE } from "./site";
export const BRAND = "JuicerAI";
export const SOCIAL_IMAGE = "/landing/hero-poster.webp";
export function publicMetadata(title: string, description: string, path: string): Metadata {
  return {
    title: { absolute: title }, description,
    alternates: { canonical: path },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    openGraph: { type: "website", url: path, siteName: BRAND, locale: "ru_RU", title, description, images: [{ url: SOCIAL_IMAGE, width: 1920, height: 790, alt: "JuicerAI — контент-завод для Telegram, VK и MAX" }] },
    twitter: { card: "summary_large_image", title, description, images: [SOCIAL_IMAGE] },
  };
}
export function productEntities() {
  return [
    { "@type": "Organization", "@id": `${SITE}/#organization`, name: BRAND, alternateName: ["juicer.ai", "Контент-завод JuicerAI"], url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/logo-main.svg` }, email: "info@juicerai.ru" },
    { "@type": "WebSite", "@id": `${SITE}/#website`, name: BRAND, alternateName: "Контент-завод JuicerAI", url: SITE, inLanguage: "ru-RU", publisher: { "@id": `${SITE}/#organization` } },
    { "@type": "SoftwareApplication", "@id": `${SITE}/#software`, name: BRAND, applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "ru-RU", url: SITE, publisher: { "@id": `${SITE}/#organization` }, description: "Сервис создания и планирования контента с ИИ для брендов: посты, изображения, карусели и публикации в подключённых каналах Telegram, VK и MAX." },
  ];
}
export const jsonLdText = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
