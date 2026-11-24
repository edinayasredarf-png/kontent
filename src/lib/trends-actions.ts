"use server";
import { requireWriter } from "./auth";
import { withUsage } from "./billing";
import { findTrends, trendToMaterial, suggestTrendTopics } from "./trends";
import type { TrendRun } from "./trends-data";
import { InsufficientFunds } from "./wallet";
import { isSchemaError } from "./errors";
const message = (e: unknown) => e instanceof InsufficientFunds ? "Недостаточно токенов. Пополните баланс." : isSchemaError(e) ? "Раздел обновляется: требуется миграция 040_trends.sql." : (e instanceof Error ? e.message.slice(0,400) : "Не удалось выполнить запрос. Попробуйте ещё раз.");
export async function findTrendsAction(input: { factory: string; query: string; days: number }): Promise<{ run?: TrendRun; error?: string }> {
  const c = await requireWriter();
  try {
    const run = await withUsage({ orgId:c.org.id, userId:c.user.id }, () => findTrends(c.org.id,String(input.factory).slice(0,36),String(input.query).trim().slice(0,121),Number(input.days)));
    return { run };
  } catch(e) { return { error: message(e) }; }
}
export async function trendMaterialAction(run: string, idea: string): Promise<{ url?: string; error?: string }> {
  const c = await requireWriter();
  try { const id = await trendToMaterial(c.org.id,String(run).slice(0,36),String(idea).slice(0,10)); return {url:`/app/create?item=${id}`}; }
  catch(e) { return {error:message(e)}; }
}

export async function trendTopicsAction(factory: string):Promise<{topics?:string[];error?:string}> {
 const c=await requireWriter();
 try{return {topics:await withUsage({orgId:c.org.id,userId:c.user.id},()=>suggestTrendTopics(c.org.id,String(factory).slice(0,36)))};}
 catch(e){return {error:message(e)};}
}
