import { one } from "./db";
import { PLANS, type Plan, type PlanKey } from "./plans";
import { tokenUnits } from "./tokens";
export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];
export const FEATURE_KEYS = ["create", "monitor", "analytics", "studio", "autopublish"] as const;
export type PlanTerms = Plan & { capabilities?: string[] };
export function validatePlan(raw: unknown, key: PlanKey): PlanTerms {
  if (!raw || typeof raw !== "object") throw new Error("Некорректный тариф");
  const p = raw as PlanTerms;
  if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 80) throw new Error("Укажите название тарифа");
  if (!Number.isFinite(p.priceRub) || p.priceRub < 0 || p.priceRub > 1_000_000 || Math.abs(p.priceRub * 100 - Math.round(p.priceRub * 100)) > 0.001) throw new Error("Цена: от 0 до 1 000 000 ₽, до двух знаков после запятой");
  tokenUnits(p.tokens);
  if (!Number.isInteger(p.durationDays) || p.durationDays < 1 || p.durationDays > 366) throw new Error("Срок: от 1 до 366 дней");
  for (const k of ["brands", "factories", "members", "sources"] as const) if (p[k] !== null && (!Number.isInteger(p[k]) || p[k]! < 0 || p[k]! > 100000)) throw new Error("Некорректные лимиты тарифа");
  if (!Array.isArray(p.features) || p.features.length > 20 || p.features.some(x => typeof x !== "string" || x.length > 200)) throw new Error("Не более 20 описаний функций");
  if (!Array.isArray(p.unlimitedModels) || p.unlimitedModels.length > 100 || p.unlimitedModels.some(m => typeof m !== "string" || !/^[\w./:@+-]{2,160}$/.test(m))) throw new Error("Укажите точные ID моделей безлимита");
  if (p.capabilities && (!Array.isArray(p.capabilities) || p.capabilities.some(x => !(FEATURE_KEYS as readonly string[]).includes(x)))) throw new Error("Неизвестная функция тарифа");
  if (key === "free" && (p.priceRub !== 0 || p.tokens !== 0 || p.unlimitedModels.length)) throw new Error("Бесплатный тариф не начисляет повторные токены и безлимит");
  if (key !== "free" && p.priceRub <= 0) throw new Error("Платный тариф должен иметь цену");
  return { ...p, key, name: p.name.trim(), enabled: !!p.enabled, unlimitedModels: [...new Set(p.unlimitedModels)], capabilities: p.capabilities ?? [...FEATURE_KEYS] };
}
export async function planCatalog(): Promise<Record<PlanKey, PlanTerms>> {
  const row = await one<{ value: Record<string, unknown> }>("select value from kz_platform_settings where key='billing_plans'");
  return Object.fromEntries(PLAN_KEYS.map(k => [k, validatePlan(row?.value?.[k] ?? PLANS[k], k)])) as Record<PlanKey, PlanTerms>;
}
export function effectiveTerms(catalog: Record<PlanKey, PlanTerms>, org: { plan: PlanKey; plan_until?: string | Date | null; plan_terms?: PlanTerms | null }): PlanTerms {
  if (org.plan_until && new Date(org.plan_until).getTime() <= Date.now()) return catalog.free;
  return org.plan_terms ? validatePlan(org.plan_terms, org.plan) : catalog[org.plan] ?? catalog.free;
}
export async function orgPlan(orgId: string): Promise<PlanTerms> {
  const [catalog, org] = await Promise.all([planCatalog(), one<{ plan: PlanKey; plan_until: string | null; plan_terms: PlanTerms | null }>("select plan,plan_until,plan_terms from kz_orgs where id=$1", [orgId])]);
  return org ? effectiveTerms(catalog, org) : catalog.free;
}
export async function requireFeature(orgId: string, feature: typeof FEATURE_KEYS[number]) {
  const o = await one<{ unlimited: boolean; timed: boolean }>("select unlimited,unlimited_until>now() timed from kz_orgs where id=$1", [orgId]);
  if (o?.unlimited || o?.timed) return;
  if (!(await orgPlan(orgId)).capabilities?.includes(feature)) throw new Error("Эта функция не входит в ваш тариф. Выберите другой тариф в разделе оплаты.");
}

export async function requirePageFeature(orgId: string, feature: typeof FEATURE_KEYS[number]) {
  try { await requireFeature(orgId, feature); } catch (e) {
    if ((e as Error).message.startsWith("Эта функция не входит")) {
      const { redirect } = await import("next/navigation");
      redirect(`/app/billing?err=${encodeURIComponent((e as Error).message)}`);
    }
    throw e;
  }
}
