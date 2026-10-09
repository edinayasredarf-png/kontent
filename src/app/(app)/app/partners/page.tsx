import { requireCtx } from "@/lib/auth";
import { newRefCode } from "@/lib/auth";
import { ensureRefCode, referralStats } from "@/lib/account";
import { headers } from "next/headers";
import { PageHead } from "@/components/ui";

export default async function Partners() {
  const c = await requireCtx();
  const code = await ensureRefCode(c.user.id, newRefCode);
  const st = await referralStats(c.user.id);
  const h = await headers();
  const host = process.env.APP_URL?.trim().replace(/\/+$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const link = `${host}/r/${code}`;
  return (
    <>
      <PageHead title="Партнёрская программа" sub="Приглашайте компании и получайте вознаграждение с их оплат." />
      <section className="card mb-6 max-w-2xl p-6">
        <b className="mb-2 block text-sm">Ваша ссылка</b>
        <input readOnly value={link} className="input font-mono text-xs" />
        <p className="mt-2 text-xs text-ink3">Человек, который зарегистрируется по ссылке в течение 30 дней после перехода, будет закреплён за вами.</p>
      </section>
      <div className="mb-6 grid max-w-2xl grid-cols-3 gap-3">
        {[["Регистраций", st?.signups ?? "0"], ["Оплатили", st?.paid ?? "0"], ["Начислено", `${(Number(st?.earned ?? 0) / 100).toLocaleString("ru-RU")} ₽`]].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-tile p-5"><div className="mb-1 text-sm text-ink2">{l}</div><div className="text-2xl font-semibold">{v}</div></div>
        ))}
      </div>
      <p className="max-w-2xl rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Начисления за оплаты включатся вместе с подключением оплаты. Регистрации по вашей ссылке учитываются уже сейчас.</p>
    </>
  );
}
