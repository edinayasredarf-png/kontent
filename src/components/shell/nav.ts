import { Sparkles, Factory, Radar, CalendarDays, Rss, Crosshair, BarChart3, Wand2, Settings, type LucideIcon } from "lucide-react";

export interface NavChild { href: string; label: string }
export interface NavItem {
  href: string; label: string; icon: LucideIcon; exact?: boolean; pro?: boolean;
  /** подпапки меню; пункт «Заводы» дополнительно получает список заводов клиента */
  children?: NavChild[]; factories?: boolean;
}

/** Главное меню. Подпапка только у «Заводов» (список заводов клиента); бренды, база знаний и команда — вкладки рядом с заводами, остальное лежит в «Настройках». */
export const NAV: NavItem[] = [
  { href: "/app", label: "Чат", icon: Sparkles, exact: true },
  { href: "/app/create", label: "Создать контент", icon: Wand2 },
  { href: "/app/factories", label: "Заводы", icon: Factory, pro: true, factories: true },
  { href: "/app/calendar", label: "Контент план", icon: CalendarDays },
  { href: "/app/monitor", label: "Новости", icon: Radar },
  { href: "/app/flows", label: "Автолента", icon: Rss },
  { href: "/app/competitors", label: "Конкуренты", icon: Crosshair },
  { href: "/app/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/app/settings", label: "Настройки", icon: Settings },
];

/** Для быстрого поиска по разделам в шапке. */
export const SEARCH_ITEMS: { href: string; label: string; words: string }[] = [
  ...NAV.flatMap((n) => [{ href: n.href, label: n.label, words: "" }, ...(n.children ?? []).map((c) => ({ href: c.href, label: c.label, words: "" }))]),
  { href: "/app/publications", label: "Публикации", words: "очередь опубликовано" },
  { href: "/app/inbox", label: "Входящие", words: "комментарии ответы" },
  { href: "/app/brands", label: "Бренды", words: "брендбук цвета шрифты логотип" },
  { href: "/app/knowledge", label: "База знаний", words: "брендбук документы стиль" },
  { href: "/app/studio", label: "ИИ-ассистенты", words: "студия инструменты" },
  { href: "/app/monitor", label: "Мониторинг новостей", words: "новости лента источники" },
  { href: "/app/monitor/settings", label: "Источники и ключевые слова", words: "мониторинг rss telegram" },
  { href: "/app/channels", label: "Каналы публикации", words: "telegram vk max wordpress подключить" },
  { href: "/app/billing", label: "Баланс и тариф", words: "оплата деньги пополнить" },
  { href: "/app/team", label: "Команда", words: "приглашения роли" },
  { href: "/app/developers", label: "API и интеграции", words: "ключи webhook" },
  { href: "/app/partners", label: "Партнёрская программа", words: "реферал" },
  { href: "/app/profile", label: "Профиль и безопасность", words: "пароль тема" },
  { href: "/app/overview", label: "Сводка", words: "что горит обзор" },
  { href: "/app/create", label: "Создание материалов", words: "создать карусель пост ролик сторис статья слайды картинки пресет качество модель референсы примеры аудитория" },
  { href: "/app/assistant", label: "Быстрый запуск бизнеса", words: "лия завод бренд" },
  { href: "/app/factories/new", label: "Создать завод", words: "новый завод" },
];
