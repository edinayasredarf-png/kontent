import { AsyncLocalStorage } from "node:async_hooks";
import { q } from "./db";

/**
 * Учёт расходов на нейросети. Каждый вызов шлюза записывается с тем, чей он и на что: контекст (организация, пользователь, причина списания)
 * ставится при входе в кабинет и в момент списания денег, а вызов нейросети, который идёт следом, берёт его оттуда сам — передавать
 * ничего вручную не нужно. Стоимость считается по прайсу моделей, который заполняет администратор.
 */
export interface UsageCtx { orgId?: string; userId?: string; reason?: string; ref?: string }
const als = new AsyncLocalStorage<UsageCtx>();

/** Дополняет контекст учёта для всего дальнейшего хода запроса. */
export function setUsageCtx(patch: UsageCtx) { als.enterWith({ ...(als.getStore() ?? {}), ...patch }); }
export const getUsageCtx = () => als.getStore() ?? {};
/** Выполняет функцию с отдельным контекстом (воркер: одна организация за другой). */
export const withUsage = <T>(ctx: UsageCtx, fn: () => Promise<T>) => als.run({ ...ctx }, fn);

/** Действия, по которым администратор разбирает экономику: код → название. */
export const ACTIONS: Record<string, string> = {
  generate: "Создание материала (текст, карусель, статья…)", plan: "Контент-план", repurpose: "Контент из источника", idea: "Идеи", image: "Картинка", image_edit: "Доработка изображения",
  image_section: "Картинки к разделам статьи", cover: "Обложка и слайды карусели", edit: "Правка текста ИИ", chat: "Чат-ассистент", analysis: "Аналитика и разборы", variants: "Варианты и версии под площадки",
  lead: "Лид-магнит", reply: "Ответы на комментарии", studio: "Студия", kb: "База знаний бренда", other: "Прочее",
};

/** Код действия по тексту причины списания (причины в коде фиксированные, поэтому разбор по началу строки надёжен). */
export function actionOf(reason: string): string {
  const r = reason.toLowerCase();
  const rules: [RegExp, string][] = [
    [/^возврат/, "refund"], [/^генерация:/, "generate"], [/^контент-план/, "plan"], [/^контент из источника/, "repurpose"], [/^идея из поста|^ещё \d+ идей/, "idea"],
    [/^картинка к разделу/, "image_section"], [/^картинка:/, "image"], [/^доработка изображения/, "image_edit"], [/^обложка|^пересборка слайдов/, "cover"],
    [/^правка текста/, "edit"], [/^чат:|^лия:|^быстрый запуск/, "chat"],
    [/^сводка трендов|^рекомендации по аналитике|^разбор конкурентов|^подборка новостей|^подбор ключевых|^контент-стратегия/, "analysis"],
    [/^a\/b-вариант|^версии под площадки/, "variants"], [/^тексты лид-магнита/, "lead"], [/^черновик ответа/, "reply"], [/^студия:/, "studio"], [/^база знаний|^kb/, "kb"],
  ];
  return rules.find(([re]) => re.test(r))?.[1] ?? "other";
}

interface ModelPrice { in: number; out: number; image: number; call: number }
let prices: { at: number; map: Map<string, ModelPrice> } | null = null;

async function modelPrices(): Promise<Map<string, ModelPrice>> {
  if (prices && Date.now() - prices.at < 30_000) return prices.map;
  const map = new Map<string, ModelPrice>();
  try {
    for (const r of await q<{ model: string; i: string; o: string; im: string; c: string }>("select model,in_per_m_kop i,out_per_m_kop o,per_image_kop im,per_call_kop c from kz_ai_models"))
      map.set(r.model, { in: Number(r.i), out: Number(r.o), image: Number(r.im), call: Number(r.c) });
  } catch { /* миграция 027 ещё не применена: считаем без прайса */ }
  prices = { at: Date.now(), map };
  return map;
}
export const resetModelPrices = () => { prices = null; };

/** Стоимость вызова в копейках по прайсу модели (дробная: токены дёшевы). */
export function callCost(p: ModelPrice | undefined, u: { tokensIn: number; tokensOut: number; images: number }) {
  if (!p) return 0;
  return (u.tokensIn / 1e6) * p.in + (u.tokensOut / 1e6) * p.out + u.images * p.image + p.call;
}

export interface UsageInput { kind: "chat" | "image" | "vision" | "tts"; task: string; model: string; tokensIn?: number; tokensOut?: number; images?: number }

/** Записывает вызов. Сбой записи (нет миграции, база занята) не должен ломать саму генерацию, поэтому ошибки глотаем. */
export async function recordUsage(u: UsageInput): Promise<void> {
  try {
    const ctx = getUsageCtx();
    const map = await modelPrices();
    const p = map.get(u.model);
    const tokensIn = Math.max(0, Math.round(u.tokensIn ?? 0)), tokensOut = Math.max(0, Math.round(u.tokensOut ?? 0)), images = u.images ?? 0;
    const cost = callCost(p, { tokensIn, tokensOut, images });
    await q(`insert into kz_ai_usage(org_id,user_id,action,reason,ref,kind,task,model,tokens_in,tokens_out,images,cost_kop,priced) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [ctx.orgId ?? null, ctx.userId ?? null, actionOf(ctx.reason ?? ""), (ctx.reason ?? "").slice(0, 200), ctx.ref ?? null, u.kind, u.task, u.model.slice(0, 120), tokensIn, tokensOut, images, cost, !!p]);
  } catch { /* учёт необязателен */ }
}
