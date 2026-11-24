/** Основной адрес сайта: для canonical, sitemap и разметки. Без APP_URL — адрес рабочего домена по умолчанию. */
export const SITE = (process.env.APP_URL?.trim().replace(/^["'`\s]+|["'`\s]+$/g, "").replace(/\/+$/, "")) || "https://juicerai.ru";
