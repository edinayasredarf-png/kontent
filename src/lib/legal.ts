/** Версия текстов: меняйте при правке документов — у пользователей хранится, с какой версией они согласились. */
export const LEGAL_VERSION = "2026-11-16";

// Новая редакция реквизитов из документа ИП. Администратор может обновлять её в кабинете.
export const OPERATOR_SETTINGS_KEY = "legal_operator_2026_11";
export function operator(): OperatorDetails {
  return {
    name: "ИП Статов Андрей Викторович",
    inn: "616304774592",
    ogrn: "320619600158597",
    address: "344092, Ростовская область, г. Ростов-на-Дону, бул. Комарова 28е, офис. 302.",
    email: "info@juicerai.ru",
    phone: "8 (863)284-00-24",
    site: "https://juicerai.ru",
    bank: 'ООО "Банк Точка"',
    account: "4080281040100121123",
    corrAccount: "30101810745374525104",
    bic: "044525104",
  };
}
export const operatorFilled = () => { const o = operator(); return !!(o.name && o.inn && o.address && o.email); };

export interface OperatorDetails { name: string; inn: string; ogrn: string; address: string; email: string; phone: string; site: string; bank: string; account: string; corrAccount: string; bic: string }
export async function loadOperator(): Promise<OperatorDetails> {
  const { one } = await import("./db");
  const saved = await one<{ value: Partial<OperatorDetails> }>(
    "select value from kz_platform_settings where key=$1", [OPERATOR_SETTINGS_KEY],
  ).catch(() => null);
  return { ...operator(), ...saved?.value };
}
export function validateOperator(raw: OperatorDetails): OperatorDetails {
  const o = Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, String(v ?? "").trim()])) as unknown as OperatorDetails;
  if (!o.name || o.name.length > 300) throw new Error("Укажите полное наименование получателя оплаты");
  if (!/^\d{10}$|^\d{12}$/.test(o.inn)) throw new Error("ИНН должен содержать 10 или 12 цифр");
  if (!/^\d{13}$|^\d{15}$/.test(o.ogrn)) throw new Error("ОГРН/ОГРНИП должен содержать 13 или 15 цифр");
  if (!o.address || o.address.length > 600) throw new Error("Укажите адрес для обращений");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) throw new Error("Укажите email для обращений");
  if (o.bic && !/^\d{9}$/.test(o.bic)) throw new Error("БИК должен содержать 9 цифр");
  for (const a of [o.account,o.corrAccount]) if (a && !/^\d{20}$/.test(a)) throw new Error("Банковский счёт должен содержать 20 цифр");
  const site = new URL(o.site);
  if (site.protocol !== "https:" || site.username || site.password) throw new Error("Укажите HTTPS-адрес сайта");
  return { ...o, site: site.origin };
}
