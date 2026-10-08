// Тарифы — в коде, а не в БД: меняются редко, а лимиты проверяются на каждом создании сущности.
export type PlanKey = "free" | "start" | "business" | "pro" | "agency";

export interface Plan {
  key: PlanKey;
  name: string;
  priceRub: number;
  brands: number | null;     // null = без ограничений
  factories: number | null;
  members: number | null;
  sources: number | null;    // источников мониторинга
  features: string[];
}

export const PLANS: Record<PlanKey, Plan> = {
  free:     { key: "free",     name: "Free",      priceRub: 0,     brands: 1,    factories: 1,    members: 1,    sources: 5,    features: ["Оплата за генерации"] },
  start:    { key: "start",    name: "Старт",     priceRub: 2990,  brands: 2,    factories: 3,    members: 2,    sources: 15,   features: ["Автопубликация", "Контент-план на 30 дней"] },
  business: { key: "business", name: "Бизнес",    priceRub: 7990,  brands: 5,    factories: 10,   members: 5,    sources: 40,   features: ["Все форматы", "Правила бренда и антиповторы"] },
  pro:      { key: "pro",      name: "Про",       priceRub: 14990, brands: 15,   factories: 40,   members: 15,   sources: 100,  features: ["Приоритетная очередь", "Аналитика"] },
  agency:   { key: "agency",   name: "Агентство", priceRub: 29990, brands: null, factories: null, members: null, sources: null, features: ["Безлимит брендов и заводов", "Роли клиентов"] },
};

export const fmtLimit = (n: number | null) => (n === null ? "∞" : String(n));
