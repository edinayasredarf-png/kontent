import clsx from "clsx";

export const PageHead = ({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) => (
  <div className="mx-auto mb-8 max-w-[640px] text-center">
    <h1 className="text-[28px] font-semibold leading-8 tracking-tight md:text-3xl">{title}</h1>{sub && <p className="mt-2 text-sm text-ink2">{sub}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
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
