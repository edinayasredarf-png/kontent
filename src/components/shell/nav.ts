import { Sparkles, Factory, Radar, Building2, CalendarDays, Rss, Crosshair, Inbox, Send, BarChart3, Wand2, Radio, GalleryVerticalEnd } from "lucide-react";

/** Главное меню. Всё остальное (баланс, команда, API, партнёрка, профиль, администрирование) живёт в «Настройках». */
export const NAV = [
  { href: "/app", label: "Чат", icon: Sparkles, exact: true },
  { href: "/app/factories", label: "Заводы", icon: Factory, pro: true },
  { href: "/app/brands", label: "Бренды", icon: Building2, pro: true },
  { href: "/app/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/app/monitor", label: "Новости", icon: Radar },
  { href: "/app/flows", label: "Автолента", icon: Rss },
  { href: "/app/competitors", label: "Конкуренты", icon: Crosshair },
  { href: "/app/inbox", label: "Входящие", icon: Inbox },
  { href: "/app/publications", label: "Публикации", icon: Send },
  { href: "/app/channels", label: "Каналы", icon: Radio },
  { href: "/app/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/app/create", label: "Создать", icon: GalleryVerticalEnd },
  { href: "/app/studio", label: "ИИ-ассистенты", icon: Wand2 },
] as const;

/** Для быстрого поиска по разделам в шапке. */
export const SEARCH_ITEMS: { href: string; label: string; words: string }[] = [
  ...NAV.map((n) => ({ href: n.href, label: n.label, words: "" })),
  { href: "/app/monitor", label: "Мониторинг новостей", words: "новости лента источники" },
  { href: "/app/monitor/settings", label: "Источники и ключевые слова", words: "мониторинг rss telegram" },
  { href: "/app/channels", label: "Каналы публикации", words: "telegram vk max wordpress подключить" },
  { href: "/app/billing", label: "Баланс и тариф", words: "оплата деньги пополнить" },
  { href: "/app/team", label: "Команда", words: "приглашения роли" },
  { href: "/app/developers", label: "API и интеграции", words: "ключи webhook" },
  { href: "/app/partners", label: "Партнёрская программа", words: "реферал" },
  { href: "/app/profile", label: "Профиль и безопасность", words: "пароль тема" },
  { href: "/app/settings", label: "Настройки", words: "" },
  { href: "/app/overview", label: "Сводка", words: "что горит обзор" },
  { href: "/app/create", label: "Создание материалов", words: "создать карусель пост ролик сторис статья слайды картинки пресет качество модель референсы примеры аудитория" },
  { href: "/app/assistant", label: "Быстрый запуск бизнеса", words: "лия завод бренд" },
];
