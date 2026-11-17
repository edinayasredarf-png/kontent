import Link from "next/link";
import { Plus } from "lucide-react";

export function FactoryTabs({ factoryId, brandId, tab, canCreate }: { factoryId: string; brandId: string; tab: string; canCreate: boolean }) {
  const path = `/app/factories/${factoryId}`;
  const tabs = [
    { key: "settings", label: "Настройки завода", href: `${path}?tab=settings` },
    ...(canCreate ? [
      { key: "brand", label: "Настройки бренда", href: `/app/brands/${brandId}?factory=${factoryId}` },
      { key: "knowledge", label: "База знаний", href: `/app/brands/${brandId}/knowledge?factory=${factoryId}` },
    ] : []),
    { key: "content", label: "Контент", href: `${path}?tab=content` },
    ...(canCreate ? [{ key: "team", label: "Пользователи", href: `/app/team?factory=${factoryId}` }] : []),
  ];
  const active = tab === "plan" || tab === "create" ? "content" : tab;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-ink/10">
      <nav aria-label="Разделы завода" className="no-scrollbar -mb-px flex min-w-0 overflow-x-auto">
        {tabs.map(({ key, label, href }) => (
          <Link key={key} href={href} aria-current={active === key ? "page" : undefined}
            className={`relative flex h-12 items-center whitespace-nowrap px-2.5 text-base font-medium ${active === key ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent" : "text-ink/70 hover:text-ink"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {canCreate && <Link href={`${path}?tab=create`} className="btn btn-accent mb-2 !rounded-xl">
        Создать контент <Plus size={16} />
      </Link>}
    </div>
  );
}

export function FactoryContentTabs({ factoryId, section }: { factoryId: string; section: "published" | "drafts" | "plan" }) {
  const path = `/app/factories/${factoryId}`;
  const tabs = [
    { key: "published", label: "Опубликованные", href: `${path}?tab=content` },
    { key: "drafts", label: "Черновики", href: `${path}?tab=content&section=drafts` },
    { key: "plan", label: "Контент-план", href: `${path}?tab=plan` },
  ];
  return (
    <nav aria-label="Материалы завода" className="flex flex-wrap items-center gap-2">
      {tabs.map(({ key, label, href }) => (
        <Link key={key} href={href} aria-current={section === key ? "page" : undefined} className={`rounded-xl border px-4 py-2 text-sm ${section === key ? "border-transparent bg-tile font-semibold text-ink" : "border-line text-ink2 hover:bg-tile"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
