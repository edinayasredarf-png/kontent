import { Globe, Newspaper, PenLine } from "lucide-react";
import type { Kind } from "@/lib/monitor/fetchers";

/** Круглая иконка источника: Telegram, VK, MAX, сайт, новости по запросу, ручной ввод. Рисуется встроенно, без внешних запросов. */
export function SourceIcon({ kind, size = 36 }: { kind: Kind; size?: number }) {
  const box = { width: size, height: size };
  if (kind === "telegram") return (
    <span style={box} className="grid shrink-0 place-items-center rounded-full bg-[#2aabee]" aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="#fff"><path d="M9.4 15.6 9.2 19c.4 0 .6-.2.8-.4l1.9-1.8 3.9 2.9c.7.4 1.2.2 1.4-.7l2.5-11.9c.3-1.1-.4-1.6-1.1-1.3L3.9 11.4c-1.1.4-1.1 1.1-.2 1.4l3.8 1.2 8.8-5.5c.4-.3.8-.1.5.2" /></svg>
    </span>
  );
  if (kind === "vk") return <span style={box} className="grid shrink-0 place-items-center rounded-full bg-[#0077ff] text-[11px] font-bold leading-none text-white" aria-hidden>VK</span>;
  if (kind === "max") return <span style={box} className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2d9bff] to-[#8a3ffc] text-sm font-bold leading-none text-white" aria-hidden>M</span>;
  const Icon = kind === "news" ? Newspaper : kind === "manual" ? PenLine : Globe;
  return <span style={box} className="grid shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200" aria-hidden><Icon size={size * 0.5} /></span>;
}
