import clsx from "clsx";

/** Заголовок страницы: слева вверху белой области, как в макете; действие справа. */
export const PageHead = ({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) => (
  <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-[28px] font-semibold leading-8 text-ink md:text-4xl">{title}</h1>{sub && <p className="mt-3 max-w-2xl text-sm text-ink2">{sub}</p>}
    </div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </div>
);

export const Empty = ({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) => (
  <div className="card mx-auto flex w-full max-w-[560px] flex-col items-center px-6 py-12 text-center">
    <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-tile text-ink3">{icon}</div>
    <b>{title}</b><p className="mb-4 mt-1 max-w-sm text-sm text-ink2">{text}</p>{action}
  </div>
);

export const STATUS: Record<string, { label: string; cls: string }> = {
  idea: { label: "Идея", cls: "bg-tile text-ink2" },
  approved: { label: "Одобрено", cls: "bg-accent-soft text-accent-ink" },
  generating: { label: "Генерация…", cls: "bg-warn-soft text-warn" },
  ready: { label: "Готово", cls: "bg-good-soft text-good" },
  scheduled: { label: "В очереди", cls: "bg-accent-soft text-accent-ink" },
  published: { label: "Опубликовано", cls: "bg-good-soft text-good" },
  failed: { label: "Ошибка", cls: "bg-bad-soft text-bad" },
  rejected: { label: "Отклонено", cls: "bg-tile text-ink3" },
};
export const Status = ({ s }: { s: string }) => <span className={clsx("chip", STATUS[s]?.cls)}>{STATUS[s]?.label ?? s}</span>;

export { KIND } from "@/lib/kinds";
