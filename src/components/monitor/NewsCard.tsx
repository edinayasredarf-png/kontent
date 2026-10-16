import { SourceIcon } from "./SourceIcon";
import { sourceView } from "@/lib/monitor/display";
import type { Kind } from "@/lib/monitor/fetchers";

export interface NewsSource { kind: Kind; title: string; ref: string; config: Record<string, unknown> | null }

/** Карточка новости в стиле поста Telegram: сверху иконка источника, название, адрес и дата; ниже содержимое. Одинакова в «Новостях» и в «Автоленте». */
export function NewsCard({ s, when, children, actions }: { s: NewsSource; when: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const sv = sourceView(s.kind, s.title, s.ref, s.config ?? {});
  const avatar = typeof s.config?.avatar === "string" ? s.config.avatar : undefined;
  return (
    <article className="rounded-3xl bg-tile p-2.5 will-change-transform [transition:opacity_.15s_linear]">
      <header className="flex items-center gap-3 rounded-2xl bg-accent-soft px-3 py-2.5">
        <SourceIcon kind={s.kind} avatar={avatar} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5">{sv.name}</p>
          {sv.href ? <a href={sv.href} target="_blank" rel="noreferrer noopener" className="block truncate text-xs leading-4 text-ink2 hover:text-accent-ink">{sv.address}</a> : <p className="truncate text-xs leading-4 text-ink2">{sv.address}</p>}
        </div>
        <span className="shrink-0 self-start pt-0.5 text-xs text-ink3">{when}</span>
      </header>
      <div className="px-2.5 pb-1 pt-3">{children}</div>
      {actions && <div className="mt-2 flex flex-wrap items-center gap-2 px-2.5 pb-2 pt-2">{actions}</div>}
    </article>
  );
}
