/** Wallet integers are hundredths of a product token, never an AI provider's tokens or RUB. */
export const TOKEN_SCALE = 100;
export const tokens = (units: number) => `${(units / TOKEN_SCALE).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ток.`;
export function tokenUnits(value: number) {
  const units = Math.round(value * TOKEN_SCALE);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(units) || units > 1_000_000_000) throw new Error("Некорректное количество токенов");
  return units;
}
