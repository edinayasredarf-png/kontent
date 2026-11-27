/** Public metadata only. Application secrets never enter this module or the browser. */
export const SOCIAL_PROVIDERS = ["pinterest", "ok", "facebook", "instagram", "threads"] as const;
export type SocialProvider = typeof SOCIAL_PROVIDERS[number];
export const isSocialProvider = (v: string): v is SocialProvider => (SOCIAL_PROVIDERS as readonly string[]).includes(v);
export const SOCIAL_NAMES: Record<SocialProvider, string> = { pinterest: "Pinterest", ok: "Одноклассники", facebook: "Facebook", instagram: "Instagram", threads: "Threads" };
export const APP_FAMILIES = ["pinterest", "ok", "meta", "threads"] as const;
export type AppFamily = typeof APP_FAMILIES[number];
export const appFamily = (p: SocialProvider): AppFamily => p === "facebook" || p === "instagram" ? "meta" : p;
export const APP_DETAILS = {
  pinterest: { name: "Pinterest", env: "PINTEREST", register: "https://developers.pinterest.com/apps/", scopes: "boards:read, pins:write, user_accounts:read", providers: ["pinterest"] },
  ok: { name: "Одноклассники", env: "OK", register: "https://apiok.ru/dev/app/create", scopes: "VALUABLE_ACCESS, GROUP_CONTENT, PHOTO_CONTENT, PUBLISH_TO_STREAM, LONG_ACCESS_TOKEN — запросить доступы у поддержки ОК", providers: ["ok"] },
  meta: { name: "Facebook и Instagram", env: "META", register: "https://developers.facebook.com/apps/", scopes: "pages_show_list, pages_read_engagement, pages_manage_posts; для Instagram: instagram_basic, instagram_content_publish. Для внешних пользователей нужен App Review.", providers: ["facebook", "instagram"] },
  threads: { name: "Threads", env: "THREADS", register: "https://developers.facebook.com/apps/", scopes: "threads_basic, threads_content_publish. Используйте отдельные Threads App ID и App Secret; для внешних пользователей нужен Advanced Access.", providers: ["threads"] },
} satisfies Record<AppFamily, { name: string; env: string; register: string; scopes: string; providers: SocialProvider[] }>;
