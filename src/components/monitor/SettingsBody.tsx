import { loadMonitorSettings } from "@/lib/monitor/settings";
import { SettingsContent } from "./SettingsContent";

/** Dedicated settings page; the feed mounts LazySettings instead. */
export async function SettingsBody() {
  return <SettingsContent data={await loadMonitorSettings()} />;
}
