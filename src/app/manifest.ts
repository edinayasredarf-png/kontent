import type { MetadataRoute } from "next";

/** Манифест веб-приложения: значок ярлыка на главном экране телефона и запуск без адресной строки. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Контент-завод",
    short_name: "Контент-завод",
    description: "Контент для соцсетей и сайта на автопилоте",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1734fc",
    lang: "ru",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
