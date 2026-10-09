/** Основной адрес сайта: для canonical, sitemap и разметки. Без APP_URL — адрес рабочего домена по умолчанию. */
export const SITE = (process.env.APP_URL?.trim().replace(/^["'`\s]+|["'`\s]+$/g, "").replace(/\/+$/, "")) || "https://kontent.xn--80aakbcct4b2aj7m.xn--p1ai";
