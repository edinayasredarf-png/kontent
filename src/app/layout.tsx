import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CookieNotice } from "@/components/CookieNotice";
import { SITE } from "@/lib/site";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Контент-завод — Единая среда", template: "%s · Контент-завод" },
  description: "Платформа автоматического контента: бренды, заводы, публикации.",
  robots: { index: false },
};

export const viewport: Viewport = { colorScheme: "light dark" };

// Тема из cookie применяется до отрисовки страницы — без вспышки светлой темы у тех, кто выбрал тёмную. «Как в системе» решает CSS.
const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )lt_theme=(light|dark)/);if(m)document.documentElement.setAttribute('data-theme',m[1])}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body className="min-h-screen">{children}<CookieNotice /></body>
    </html>
  );
}
