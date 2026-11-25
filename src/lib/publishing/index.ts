import { discord } from "./discord";
import { telegraph } from "./telegraph";
import { facebook, instagram, threads } from "./meta";
import { pinterest } from "./pinterest";
import { connector } from "./connector";
import { CONNECTOR_CHANNELS, CHANNEL_LABELS, type ConnectorKind } from "./catalog";
import { telegram } from "./telegram";
import { vk } from "./vk";
import { wordpress } from "./wordpress";
import { webhook } from "./webhook";
import { max } from "./max";
import type { Provider } from "./types";
export { PublishError } from "./types";

const providers: Record<string, Provider> = { telegram, vk, wordpress, webhook, max, discord, telegraph, facebook, instagram, threads, pinterest, ...Object.fromEntries(Object.keys(CONNECTOR_CHANNELS).map(k => [k, connector(k as ConnectorKind)])) };
export const providerFor = (kind: string): Provider | null => Object.hasOwn(providers, kind) ? providers[kind] : null;
export const SUPPORTED_CHANNELS = CHANNEL_LABELS;
/** Каналы, куда уходят SEO-статьи; в остальные уходят обычные посты. */
export const SITE_CHANNELS = ["wordpress", "webhook", "telegraph", ...Object.keys(CONNECTOR_CHANNELS)];
/** Принимают только SEO-статьи. Webhook принимает и статьи, и обычные посты. */
export const ARTICLE_ONLY = ["wordpress"];
