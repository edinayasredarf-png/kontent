import { ensurePrices, PRICES } from "./wallet";

/** Цены для публичной страницы: берутся из действующих цен (их меняет администратор), округляются до рублей. Тексты страницы содержат метки %имя%, которые заменяются этими значениями. */
const R = (kop: number) => String(Math.max(0, Math.round(kop / 100)));
export async function landingPrices(): Promise<Record<string, string>> {
  await ensurePrices();
  const month = 30 * PRICES.post + 8 * PRICES.carousel; // пример на странице: 30 постов и 8 каруселей
  const m = Math.round(month / 100 / 10) * 10; // до десятков рублей: «≈ 880»
  const t: Record<string, string> = {
    n_post: R(PRICES.post), n_carousel: R(PRICES.carousel), n_image: R(PRICES.image), n_seo: R(PRICES.seo), n_idea: R(PRICES.idea), n_month: String(m),
  };
  for (const k of ["post", "carousel", "image", "seo", "idea"]) t[k] = `≈ ${t[`n_${k}`]} ₽`;
  t.month_kop = String(month);
  return t;
}
export const fill = (s: string, t: Record<string, string>) => s.replace(/%(\w+)%/g, (m, k: string) => t[k] ?? m);
