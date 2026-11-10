// Defaults; administrators edit the catalog in platform settings. Purchased terms are snapshotted.
export type PlanKey = "free" | "start" | "business" | "pro" | "agency";

export interface Plan {
  key: PlanKey;
  name: string;
  priceRub: number;
  tokens: number;
  durationDays: number;
  enabled: boolean;
  unlimitedModels: string[];
  brands: number | null;     // null = без ограничений
  factories: number | null;
  members: number | null;
  sources: number | null;    // источников мониторинга
  features: string[];
}

export const PLANS: Record<PlanKey, Plan> = {
  free:     { key: "free",     name: "Free",      priceRub: 0,     brands: 1,    factories: 1,    members: 1,    sources: 5,    tokens: 0, durationDays: 30, enabled: true, unlimitedModels: [], features: ["Генерации за токены"] },
  start:    { key: "start",    name: "Старт",     priceRub: 2990,  brands: 2,    factories: 3,    members: 2,    sources: 15,   tokens: 260, durationDays: 30, enabled: true, unlimitedModels: [], features: ["Автопубликация", "Контент-план на 30 дней"] },
  business: { key: "business", name: "Бизнес",    priceRub: 7990,  brands: 5,    factories: 10,   members: 5,    sources: 40,   tokens: 680, durationDays: 30, enabled: true, unlimitedModels: [], features: ["Все форматы", "Правила бренда и антиповторы"] },
  pro:      { key: "pro",      name: "Про",       priceRub: 14990, brands: 15,   factories: 40,   members: 15,   sources: 100,  tokens: 1700, durationDays: 30, enabled: true, unlimitedModels: [], features: ["Для команды маркетинга", "Аналитика"] },
  agency:   { key: "agency",   name: "Агентство", priceRub: 29990, brands: null, factories: null, members: null, sources: null, tokens: 3000, durationDays: 30, enabled: true, unlimitedModels: [], features: ["Безлимит брендов и заводов", "Роли клиентов"] },
};

export const fmtLimit = (n: number | null) => (n === null ? "∞" : String(n));
