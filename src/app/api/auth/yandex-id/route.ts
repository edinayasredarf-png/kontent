import { NextRequest } from "next/server";
import { yandexProfileFromToken } from "@/lib/oauth";
import { widgetLogin } from "@/lib/widget-login";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Вход через кнопку Яндекс ID (SDK YaAuthSuggest). Проверка токена — у Яндекса, см. widgetLogin. */
export const POST = (req: NextRequest) => widgetLogin(req, "yandex", yandexProfileFromToken);
