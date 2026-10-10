import clsx from "clsx";

export const PageHead = ({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{sub && <p className="mt-1 text-sm text-ink2">{sub}</p>}</div>
    {action}
  </div>
);

export const Empty = ({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) => (
  <div className="card flex flex-col items-center px-6 py-14 text-center">
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

export const KIND: Record<string, string> = { post: "Пост", carousel: "Карусель", reels: "Ролик", article: "Статья", story: "Сторис", seo: "SEO-статья", poll: "Опрос", contest: "Конкурс", infographic: "Инфографика" };
