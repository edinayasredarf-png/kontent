import Link from "next/link";
import { GraduationCap, ChevronRight, Radio, Radar, Wallet, UsersRound, Plug, Gift, UserRound, ShieldCheck, Cpu, Rocket, LayoutDashboard, Building2 } from "lucide-react";
import { canWrite, requireCtx } from "@/lib/auth";
import { restartOnboardingAction } from "@/lib/agent/actions";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

type Row = { href: string; title: string; text: string; icon: typeof Radio };

/** Всё, чего нет в главном меню: подключения, деньги, команда, интеграции, профиль. Оформлено блоками-списками. */
export default async function Settings() {
  const c = await requireCtx();
  const groups: { title: string; sub?: string; rows: Row[] }[] = [
    { title: "Публикации и данные", rows: [
      { href: "/app/channels", title: "Каналы публикации", text: "Telegram, ВКонтакте, MAX, WordPress, Webhook: инструкция и проверка подключения", icon: Radio },
      { href: "/app/monitor/settings", title: "Источники и ключевые слова", text: "Откуда собираем новости и по каким словам отбираем", icon: Radar },
      { href: "/app/brands", title: "База знаний брендов", text: "Статьи, документы и сравнения: ИИ учится писать в вашем стиле (внутри бренда)", icon: Building2 },
    ] },
    { title: "Аккаунт", rows: [
      { href: "/app/billing", title: "Баланс и тариф", text: "Пополнение, история списаний, тарифы", icon: Wallet },
      { href: "/app/team", title: "Команда", text: "Приглашения и роли участников", icon: UsersRound },
      { href: "/app/profile", title: "Профиль и безопасность", text: "Данные, пароль, тема оформления", icon: UserRound },
      { href: "/app/partners", title: "Партнёрская программа", text: "Реферальная ссылка и начисления", icon: Gift },
    ] },
    { title: "Дополнительно", rows: [
      { href: "/app/overview", title: "Сводка", text: "Показатели, что требует внимания, быстрый старт", icon: LayoutDashboard },
      { href: "/app/assistant", title: "Быстрый запуск бизнеса", text: "Опишите бизнес словами: создадим бренд и первый завод", icon: Rocket },
      { href: "/app/developers", title: "API и интеграции", text: "Ключи доступа, webhook, подключение из других сервисов", icon: Plug },
    ] },
  ];
  // что видит каждая роль: наблюдатель — почти ничего, редактор — без команды и ключей
  const hide: Record<string, string[]> = {
    viewer: ["/app/channels", "/app/billing", "/app/team", "/app/partners", "/app/assistant", "/app/developers", "/app/monitor/settings", "/app/brands"],
    editor: ["/app/developers"],
  };
  const hidden = c.user.guest ? [...(hide.viewer ?? []), "/app/profile"] : hide[c.org.role] ?? [];
  for (const g of groups) g.rows = g.rows.filter((r) => !hidden.includes(r.href));
  const shown = groups.filter((g) => g.rows.length > 0);
  groups.length = 0; groups.push(...shown);
  if (c.isAdmin) groups.push({ title: "Администрирование", rows: [
    { href: "/app/admin", title: "Администрирование платформы", text: "Организации, пользователи, журнал", icon: ShieldCheck },
    { href: "/app/settings/ai", title: "Настройки ИИ", text: "Какая нейросеть какую задачу выполняет", icon: Cpu },
  ] });
  const learn = canWrite(c.org.role) && !c.user.guest;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div><h2 className="text-2xl font-semibold">Настройки</h2><p className="mt-1 text-sm text-ink2">Подключения, деньги, команда и интеграции. Остальное — в главном меню слева и в чате.</p></div>
      {learn && (
        <form action={restartOnboardingAction} className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><GraduationCap size={19} /></span>
          <span className="min-w-0 flex-1"><b className="block text-sm font-semibold">Обучение с ассистентом</b><span className="block text-xs text-ink2">Пройти настройку заново в чате: бренд, брендбук, завод, каналы, мониторинг и первый материал</span></span>
          <SubmitButton className="btn btn-accent">Пройти обучение заново</SubmitButton>
        </form>
      )}
      {groups.map((g) => (
        <section key={g.title}>
          <h3 className="mb-3 text-base font-semibold">{g.title}</h3>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {g.rows.map((r) => (
              <Link key={r.href} href={r.href} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0 hover:bg-accent-soft/60">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><r.icon size={19} /></span>
                <span className="min-w-0 flex-1"><b className="block text-sm font-semibold">{r.title}</b><span className="block truncate text-xs text-ink2">{r.text}</span></span>
                <ChevronRight size={18} className="shrink-0 text-ink3" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
