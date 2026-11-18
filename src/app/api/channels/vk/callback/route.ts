import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { finishVkConnection } from "@/lib/channel-connections";
import { appOrigin } from "@/lib/oauth";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
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
