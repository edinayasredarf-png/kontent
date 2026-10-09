import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { overview, requireAdmin } from "@/lib/admin";
import { operatorFilled } from "@/lib/legal";
import { mailConfigured } from "@/lib/mail";
import { aiReady } from "@/lib/ai";
import { rub } from "@/lib/wallet";
import { AdminNav } from "@/components/AdminNav";
import { PageHead } from "@/components/ui";

export default async function AdminHome() {
  await requireAdmin();
  const o = await overview();
  const n = (k: string) => Number(o.stats[k] ?? 0);
  const tickAge = o.tick ? Math.round((Date.now() - new Date(o.tick.updated_at).getTime()) / 60000) : null;
  const checks: { ok: boolean; text: string; href?: string }[] = [
    { ok: aiReady(), text: aiReady() ? "AI Gateway подключён" : "AI Gateway не настроен (SELFHOSTED_LLM_URL)", href: "/app/settings" },
    { ok: mailConfigured(), text: mailConfigured() ? "Почта (SMTP) настроена" : "Почта не настроена: сброс пароля по email не работает (SMTP_HOST, SMTP_USER, SMTP_PASS)" },
    { ok: operatorFilled(), text: operatorFilled() ? "Реквизиты оператора заполнены" : "Реквизиты оператора не заполнены (LEGAL_NAME, LEGAL_INN, LEGAL_ADDRESS, LEGAL_EMAIL) — в юридических документах стоят пометки", href: "/legal/privacy" },
    { ok: tickAge !== null && tickAge < 15, text: tickAge === null ? "Воркер ещё ни разу не запускался: проверьте задание в cron-job.org" : tickAge < 15 ? `Воркер работает: последний проход ${tickAge} мин назад` : `Воркер не запускался ${tickAge} мин — проверьте cron-job.org и CRON_SECRET` },
    { ok: !!process.env.CRON_SECRET?.trim(), text: process.env.CRON_SECRET?.trim() ? "CRON_SECRET задан" : "CRON_SECRET не задан — воркер закрыт" },
  ];
  const tiles = [["Пользователей", n("users"), `за 7 дней: +${n("users_7d")}`], ["Организаций", n("orgs"), n("suspended") ? `приостановлено: ${n("suspended")}` : "все активны"], ["Материалов за 7 дней", n("items_7d"), `опубликовано: ${n("pubs_7d")}`], ["Расход за 7 дней", rub(n("spent_7d")), `остатки клиентов: ${rub(n("balances"))}`]];
  return (
    <>
      <PageHead title="Администрирование платформы" sub="Клиенты, балансы, тарифы и состояние системы." />
      <AdminNav active="/app/admin" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([l, v, s]) => <div key={String(l)} className="rounded-2xl bg-tile p-5"><div className="mb-1 text-sm text-ink2">{l}</div><div className="text-2xl font-semibold">{typeof v === "number" ? v.toLocaleString("ru-RU") : v}</div><div className="mt-1 text-xs text-ink3">{s}</div></div>)}
      </div>
      <section className="card mb-6 p-5">
        <b className="mb-3 block text-sm">Состояние системы</b>
        <div className="space-y-2">{checks.map((c) => {
          const inner = <><span className={c.ok ? "text-good" : "text-warn"}>{c.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span><span className="text-sm">{c.text}</span></>;
          return c.href ? <Link key={c.text} href={c.href} className="flex items-start gap-2 hover:underline">{inner}</Link> : <div key={c.text} className="flex items-start gap-2">{inner}</div>;
        })}</div>
        {n("failed_7d") > 0 && <p className="mt-3 text-sm text-bad">Ошибок публикации за 7 дней: {n("failed_7d")}</p>}
        {o.tick && <details className="mt-3 text-xs text-ink2"><summary className="cursor-pointer">Отчёт последнего прохода воркера</summary><pre className="mt-2 overflow-x-auto rounded-xl bg-tile p-3">{JSON.stringify(o.tick.value, null, 2)}</pre></details>}
      </section>
      <p className="text-xs text-ink3">Заблокированных пользователей: {n("disabled")}. Все действия администратора пишутся в «Журнал».</p>
    </>
  );
}
