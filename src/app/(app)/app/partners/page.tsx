import { CopyText } from "@/components/CopyText";
import { pageCtx } from "@/lib/auth";
import { newRefCode } from "@/lib/auth";
import { ensureRefCode, referralStats } from "@/lib/account";
import { SITE } from "@/lib/site";
import { PageHead } from "@/components/ui";

export default async function Partners() {
  const c = await pageCtx("write");
  const code = await ensureRefCode(c.user.id, newRefCode);
  const st = await referralStats(c.user.id);
  const link = `${SITE}/r/${code}`;
  return (
    <div className="w-full max-w-3xl">
      <PageHead title="Партнёрская программа" sub="Приглашайте компании и получайте вознаграждение с их оплат." />
      <section className="card mb-6 p-6">
        <b className="mb-2 block text-sm">Ваша ссылка</b>
        <div className="flex flex-wrap items-center gap-3"><input aria-label="Реферальная ссылка" readOnly value={link} className="input min-w-0 flex-1 font-mono text-xs" /><CopyText text={link} label="Копировать ссылку" /></div>
        <p className="mt-2 text-xs text-ink3">Человек, который зарегистрируется по ссылке в течение 30 дней после перехода, будет закреплён за вами.</p>
      </section>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[["Регистраций", st?.signups ?? "0"], ["Оплатили", st?.paid ?? "0"], ["Начислено", `${(Number(st?.earned ?? 0) / 100).toLocaleString("ru-RU")} ₽`]].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-tile p-5"><div className="mb-1 text-sm text-ink2">{l}</div><div className="text-2xl font-semibold">{v}</div></div>
        ))}
      </div>
      <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Начисления за оплаты включатся вместе с подключением оплаты. Регистрации по вашей ссылке учитываются уже сейчас.</p>
    </div>
  );
}
