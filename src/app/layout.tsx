import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Контент-завод — Единая среда", template: "%s · Контент-завод" },
  description: "Платформа автоматического контента: бренды, заводы, публикации.",
  robots: { index: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
