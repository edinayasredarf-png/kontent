import Link from "next/link";
import { pageCtx } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";
import { SettingsBody } from "@/components/monitor/SettingsBody";

export const maxDuration = 60;

/** Отдельная страница настроек мониторинга (при переходе из ленты открывается окном поверх неё). */
export default async function MonitorSettings() {
  await pageCtx("write");
  return (
    <div className="mx-auto w-full max-w-[760px]">
      <Link href="/app/monitor" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ArrowLeft size={14} />К ленте</Link>
      <h1 className="mb-6 text-3xl font-semibold">Источники и ключевые слова</h1>
      <div className="rounded-[28px] bg-surface p-6 shadow-float"><SettingsBody /></div>
    </div>
  );
}
