import { tx } from "./db";

export const rub = (kop: number) => `${(kop / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

/** Цены операций в копейках. Списание — в момент сборки, при ошибке — возврат (refund). */
export const PRICES = { plan_day: 300, post: 2000, carousel_slide: 700, article: 4000, reels: 9000, idea: 300, digest: 600, image: 1500, seo: 6000, script: 3000, tts: 500 } as const;

export class InsufficientFunds extends Error {}

export async function charge(orgId: string, kop: number, reason: string, ref?: string) {
  await tx(async (run) => {
    const [o] = await run<{ balance_kop: string; unlimited: boolean }>("select balance_kop,unlimited from kz_orgs where id=$1 for update", [orgId]);
    if (o?.unlimited) return; // админ платформы: генерация бесплатна, баланс не трогаем
    if (!o || Number(o.balance_kop) < kop) throw new InsufficientFunds();
    await run("update kz_orgs set balance_kop=balance_kop-$2 where id=$1", [orgId, kop]);
    await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref) values($1,$2,$3,$4)", [orgId, -kop, reason, ref ?? null]);
  });
}

export async function refund(orgId: string, kop: number, reason: string, ref?: string) {
  await tx(async (run) => {
    // не начисляем возврат за списание, которого не было
    const [o] = await run<{ unlimited: boolean }>("select unlimited from kz_orgs where id=$1", [orgId]);
    if (o?.unlimited) return;
    await run("update kz_orgs set balance_kop=balance_kop+$2 where id=$1", [orgId, kop]);
    await run("insert into kz_wallet_tx(org_id,amount_kop,reason,ref) values($1,$2,$3,$4)", [orgId, kop, `Возврат: ${reason}`, ref ?? null]);
  });
}
