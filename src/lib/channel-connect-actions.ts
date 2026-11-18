"use server";
import { revalidatePath } from "next/cache";
import { requireManager } from "./auth";
import { channelConnectConfigured, connectionStatus, connectSelected, startConnection, type ConnectionProvider } from "./channel-connections";
import { requireAdmin } from "./admin";
import { telegramCall } from "./publishing/telegram";
const error = (e: unknown) => {
  const message = (e as Error).message;
  return { ok: false as const, error: /код (27|1051)/.test(message) ? "VK пока не разрешил приложению работу со стеной и фотографиями. Администратору JuicerAI нужно запросить эти доступы в кабинете VK." : message.slice(0, 300) };
};
export async function startChannelConnection(provider: ConnectionProvider, brandId: string, factoryId?: string) {
  const c = await requireManager();
  if (!["vk", "telegram"].includes(provider)) return { ok: false as const, error: "Неизвестная площадка" };
  try { return { ok: true as const, ...await startConnection(c.org.id, c.user.id, brandId, provider, factoryId) }; } catch (e) { return error(e); }
}
export async function pollChannelConnection(id: string) {
  const c = await requireManager();
  try { return { ok: true as const, ...await connectionStatus(c.org.id, c.user.id, id) }; } catch (e) { return error(e); }
}
export async function confirmChannelConnection(id: string, target: string) {
  const c = await requireManager();
  try { const result = await connectSelected(c.org.id, c.user.id, id, target); revalidatePath("/app", "layout"); return { ok: true as const, ...result }; } catch (e) { return error(e); }
}
export async function subscribeTelegramBot() {
  await requireAdmin();
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim(), secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim(), base = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (!token || !secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret) || !base?.startsWith("https://")) return { ok: false as const, error: "Задайте TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET и HTTPS APP_URL" };
  try { await telegramCall(token, "setWebhook", { url: `${base}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false }); return { ok: true as const }; } catch (e) { return error(e); }
}

export async function channelConnectionAvailability() {
  await requireManager();
  return { telegram: channelConnectConfigured("telegram"), vk: channelConnectConfigured("vk") };
}
