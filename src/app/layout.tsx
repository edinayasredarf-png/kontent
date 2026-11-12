import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import { CookieNotice } from "@/components/CookieNotice";
import { UiEnhancer } from "@/components/UiEnhancer";
import { SITE } from "@/lib/site";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Контент-завод — Единая среда", template: "%s · Контент-завод" },
  description: "Платформа автоматического контента: бренды, заводы, публикации.",
  robots: { index: false },
};

export const viewport: Viewport = { colorScheme: "light dark", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0e1020" }] };

// Тема из cookie применяется до отрисовки страницы — без вспышки светлой темы у тех, кто выбрал тёмную. «Как в системе» решает CSS.
const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )lt_theme=(light|dark)/);if(m)document.documentElement.setAttribute('data-theme',m[1])}catch(e){}})()`;

const METRIKA_SCRIPT = `
(function(m,e,t,r,i,k,a){
  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();
  for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return;}
  k=e.createElement(t);a=e.getElementsByTagName(t)[0];
  k.async=1;k.src=r;a.parentNode.insertBefore(k,a);
})(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=114207811','ym');
ym(114207811,'init',{
  ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",
  referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true
});
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body className="min-h-screen">
        <Script id="yandex-metrika" strategy="afterInteractive">{METRIKA_SCRIPT}</Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://mc.yandex.ru/watch/114207811" style={{ position: "absolute", left: "-9999px" }} alt="" />
        </noscript>
        {children}<CookieNotice /><UiEnhancer />
      </body>
    </html>
  );
}
