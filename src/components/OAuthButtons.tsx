import { configured, creds } from "@/lib/oauth";
import { VkIdWidget } from "./VkIdWidget";
import { YandexIdWidget } from "./YandexIdWidget";

/**
 * Официальные кнопки провайдеров: Яндекс ID (SDK YaAuthSuggest) и VK ID (виджет OneTap). Обе подогнаны под стиль сайта:
 * высота 44 px, скругление 12 px. Показываем только настроенных провайдеров.
 */
export function OAuthButtons({ next = "/app" }: { verb?: string; next?: string }) {
  const ya = configured("yandex") ? creds("yandex")?.id : undefined;
  const vk = configured("vk") ? creds("vk")?.id : undefined;
  if (!ya && !vk) return null;
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3 text-xs text-ink3"><span className="h-px flex-1 bg-line" />или<span className="h-px flex-1 bg-line" /></div>
      <div className="grid gap-2.5">
        {ya && <YandexIdWidget clientId={ya} next={next} />}
        {vk && <VkIdWidget appId={vk} next={next} />}
      </div>
    </div>
  );
}
