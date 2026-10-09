import { NextRequest } from "next/server";
import { vkProfileFromToken } from "@/lib/oauth";
import { widgetLogin } from "@/lib/widget-login";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Вход через виджет VK ID (OneTap). Проверка токена — у VK, см. widgetLogin. */
export const POST = (req: NextRequest) => widgetLogin(req, "vk", vkProfileFromToken);
