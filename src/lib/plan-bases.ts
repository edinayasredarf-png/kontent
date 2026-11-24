export const PLAN_BASES={topic:"По тематике компании",news:"По новостям",trends:"По трендам"} as const;
export type PlanBase=keyof typeof PLAN_BASES;
export function planBases(raw:unknown):PlanBase[]{
 if(raw===undefined)return ["topic","news","trends"];
 if(!Array.isArray(raw))throw new Error("Выберите основу контент-плана");
 const values=[...new Set(raw.map(String))];
 if(!values.length||values.some(x=>!Object.hasOwn(PLAN_BASES,x)))throw new Error("Выберите тематику, новости или тренды");
 return values as PlanBase[];
}
