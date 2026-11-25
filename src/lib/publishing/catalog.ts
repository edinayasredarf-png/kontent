/** Client-safe catalogue. Connector entries require a separately configured publishing workflow. */
export const DIRECT_CHANNELS = {
  discord: { name: "Discord", target: "Webhook URL канала Discord", help: "Настройки канала Discord → Интеграции → Webhooks → Создать → Копировать URL. Текст до 2000 символов, до 10 изображений. Ссылка содержит секрет — хранится зашифрованной.", token: false },
  telegraph: { name: "Telegra.ph", target: "Имя автора", help: "Нужен access_token аккаунта Telegraph API (не токен Telegram-бота). Поддерживаются статьи, текст и изображения.", token: true },
  facebook: { name: "Facebook Pages", target: "Числовой ID страницы Facebook", help: "Page access token с pages_manage_posts и pages_read_engagement. Публикация от имени страницы, не личного профиля. Для подключения чужих страниц нужно одобрение приложения Meta.", token: true },
  instagram: { name: "Instagram", target: "Числовой ID профессионального аккаунта Instagram", help: "Профессиональный аккаунт, связанный со страницей Facebook. Page access token через Facebook Login с instagram_basic, instagram_content_publish и pages_read_engagement. Нужна картинка; поддерживается карусель до 10 слайдов. Для пользователей вне команды приложения требуется одобрение Meta.", token: true },
  threads: { name: "Threads", target: "Числовой ID аккаунта Threads", help: "Threads access token с threads_basic и threads_content_publish. Текст до 500 символов, до 20 изображений. Для пользователей вне тестеров требуется Advanced Access приложения.", token: true },
  pinterest: { name: "Pinterest", target: "Числовой ID доски Pinterest", help: "Access token приложения Pinterest с boards:read и pins:write. Нужна картинка; карусель — от 2 до 5 изображений. Текст до 800 символов.", token: true },
} as const;
export const CONNECTOR_CHANNELS = { dzen: "Дзен", tiktok: "TikTok", youtube: "YouTube", reddit: "Reddit", ok: "Одноклассники", rutube: "RUTUBE", x: "X", tumblr: "Tumblr", linkedin: "LinkedIn" } as const;
export type ConnectorKind = keyof typeof CONNECTOR_CHANNELS;
export const isConnectorKind = (kind: string): kind is ConnectorKind => Object.hasOwn(CONNECTOR_CHANNELS, kind);
export type DirectKind = keyof typeof DIRECT_CHANNELS;
export const isDirectKind = (kind: string): kind is DirectKind => Object.hasOwn(DIRECT_CHANNELS, kind);

export const CHANNEL_LABELS: Record<string, string> = { telegram: "Telegram", vk: "ВКонтакте", max: "MAX", wordpress: "WordPress", webhook: "Webhook", ...Object.fromEntries(Object.entries(DIRECT_CHANNELS).map(([k,v]) => [k,v.name])), ...Object.fromEntries(Object.entries(CONNECTOR_CHANNELS).map(([k,v]) => [k,`${v} · коннектор`])) };
export const CHANNEL_FORM_KINDS = ["telegram", "vk", "max", "max_bot", "wordpress", "webhook", ...Object.keys(DIRECT_CHANNELS), ...Object.keys(CONNECTOR_CHANNELS)];
