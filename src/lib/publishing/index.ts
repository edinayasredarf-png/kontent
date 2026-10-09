import { telegram } from "./telegram";
import { vk } from "./vk";
import { wordpress } from "./wordpress";
import { webhook } from "./webhook";
import type { Provider } from "./types";
export { PublishError } from "./types";

const providers: Record<string, Provider> = { telegram, vk, wordpress, webhook };
export const providerFor = (kind: string): Provider | null => providers[kind] ?? null;
export const SUPPORTED_CHANNELS: Record<string, string> = { telegram: "Telegram", vk: "ВКонтакте", wordpress: "WordPress", webhook: "Webhook (сайт)" }
/** Каналы, куда уходят SEO-статьи; в остальные уходят обычные посты. */
export const SITE_CHANNELS = ["wordpress", "webhook"];;
