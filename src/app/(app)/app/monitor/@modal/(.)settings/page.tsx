import { RouteModal } from "@/components/monitor/RouteModal";
import { SettingsBody } from "@/components/monitor/SettingsBody";

export const maxDuration = 60;

/** Настройки мониторинга окном поверх ленты (перехват маршрута /app/monitor/settings). */
export default function SettingsModal() {
  return <RouteModal title="Источники и ключевые слова"><SettingsBody /></RouteModal>;
}
