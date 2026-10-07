import { telegram } from "./telegram";
import { vk } from "./vk";
import type { Provider } from "./types";
export { PublishError } from "./types";

const providers: Record<string, Provider> = { telegram, vk };
export const providerFor = (kind: string): Provider | null => providers[kind] ?? null;
export const SUPPORTED_CHANNELS: Record<string, string> = { telegram: "Telegram", vk: "ВКонтакте" };
