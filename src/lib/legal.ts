/** Версия текстов: меняйте при правке документов — у пользователей хранится, с какой версией они согласились. */
export const LEGAL_VERSION = "2026-10-09";

/** Реквизиты оператора из переменных окружения. Пока не заполнены — в документах показываются заметные пометки. */
export function operator() {
  const E = process.env;
  const v = (k: string) => E[k]?.trim() || "";
  return {
    name: v("LEGAL_NAME"), inn: v("LEGAL_INN"), ogrn: v("LEGAL_OGRN"), address: v("LEGAL_ADDRESS"), email: v("LEGAL_EMAIL"), phone: v("LEGAL_PHONE"),
    site: v("APP_URL") || "https://kontent.единаясреда.рф",
  };
}
export const operatorFilled = () => { const o = operator(); return !!(o.name && o.inn && o.address && o.email); };
