import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "./auth";
import { finishVkConnection } from "./channel-connections";
import { appOrigin } from "./oauth";
export async function vkChannelCallbackHandler(req: NextRequest) {
  const c = await requireManager(), p = req.nextUrl.searchParams;
  const result = new URL("/app/channels/connect", appOrigin(req));
  if (p.get("error")) result.searchParams.set("error", "Вы отменили подключение VK. Попробуйте снова, когда будете готовы.");
  else try {
    const state = p.get("state") || "", code = p.get("code") || "", deviceId = p.get("device_id") || "";
    if (!state || !code || !deviceId) throw new Error("VK вернул неполные данные. Начните подключение заново.");
    result.searchParams.set("connection", await finishVkConnection(c.org.id, c.user.id, state, code, deviceId));
  } catch (e) { result.searchParams.set("error", (e as Error).message.slice(0, 300)); }
  return NextResponse.redirect(result);
}

export async function socialChannelCallbackHandler(req: NextRequest, provider: import("./social-oauth-catalog").SocialProvider) {
  const c = await requireManager(), p = req.nextUrl.searchParams;
  const { socialRedirectUri } = await import("./social-oauth-config");
  const { finishSocialConnection } = await import("./channel-connections");
  const result = new URL("/app/channels/connect", socialRedirectUri(provider));
  try {
    const state = p.get("state") || "";
    if (!state || state.length > 200) throw new Error("Соцсеть не вернула корректный state. Начните подключение заново.");
    result.searchParams.set("connection", await finishSocialConnection(c.org.id, c.user.id, provider, state, p.get("code") || "", !!p.get("error")));
  } catch (e) { result.searchParams.set("error", (e as Error).message.slice(0, 300)); }
  const response = NextResponse.redirect(result);
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
