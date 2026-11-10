import { one, q } from "./db";
import { open, seal } from "./crypto";
export interface YooConfig { enabled: boolean; shopId: string; secret: string; testMode: boolean; origin: string; receipt: boolean; vatCode: number; taxSystem: number | null }
export async function yooConfig(): Promise<YooConfig> {
  const r = await one<{ value: Record<string, unknown> }>("select value from kz_platform_settings where key='yookassa'");
  const v = r?.value ?? {};
  return { enabled: v.enabled === true, shopId: String(v.shopId || process.env.YOOKASSA_SHOP_ID || ""), secret: open(v.credentials).secret || process.env.YOOKASSA_SECRET_KEY || "", testMode: v.testMode !== false, origin: String(v.origin || process.env.APP_URL || "https://juicerai.ru").replace(/\/$/, ""), receipt: v.receipt !== false, vatCode: Number(v.vatCode || 1), taxSystem: v.taxSystem ? Number(v.taxSystem) : null };
}
export async function saveYooConfig(input: YooConfig) {
  if (!/^\d{1,20}$/.test(input.shopId)) throw new Error("Укажите shopId из кабинета ЮKassa");
  const origin = new URL(input.origin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Адрес сайта: https://домен без пути");
  if (!Number.isInteger(input.vatCode) || input.vatCode < 1 || input.vatCode > 12) throw new Error("Некорректный код НДС");
  if (input.taxSystem !== null && (!Number.isInteger(input.taxSystem) || input.taxSystem < 1 || input.taxSystem > 6)) throw new Error("Некорректная система налогообложения");
  const previous = await yooConfig();
  const secret = input.secret || previous.secret;
  if (!secret) throw new Error("Укажите секретный ключ ЮKassa");
  if (input.testMode !== secret.startsWith("test_")) throw new Error("Тип ключа не совпадает с режимом магазина (тестовый / боевой)");
  await q("insert into kz_platform_settings(key,value) values('yookassa',$1::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now()", [JSON.stringify({ ...input, secret: undefined, origin: origin.origin, credentials: seal({ secret }) })]);
}
export interface YooPayment { id: string; status: "pending" | "waiting_for_capture" | "succeeded" | "canceled"; paid: boolean; test: boolean; amount: { value: string; currency: string }; metadata?: Record<string, string>; recipient?: { account_id: string }; confirmation?: { confirmation_url?: string } }
export async function yooRequest<T>(config: YooConfig, path: string, body?: unknown, key?: string): Promise<T> {
  if (!config.shopId || !config.secret) throw new Error("ЮKassa ещё не настроена");
  const response = await fetch(`https://api.yookassa.ru/v3/${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Basic ${Buffer.from(`${config.shopId}:${config.secret}`).toString("base64")}`, "Content-Type": "application/json", ...(key ? { "Idempotence-Key": key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`ЮKassa недоступна (${response.status}). Повторите проверку позже.`);
  return await response.json() as T;
}
export function amountKop(value: string): number {
  if (!/^\d{1,9}\.\d{2}$/.test(value)) throw new Error("Некорректная сумма платежа");
  const [whole, fraction] = value.split(".");
  return Number(whole) * 100 + Number(fraction);
}
export function confirmationUrl(raw: string | undefined): string {
  if (!raw) throw new Error("ЮKassa не вернула ссылку на оплату");
  const u = new URL(raw);
  if (u.protocol !== "https:" || u.username || u.password || !["yoomoney.ru", "yookassa.ru"].some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))) throw new Error("Некорректная ссылка оплаты");
  return u.href;
}
