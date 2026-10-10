import { q } from "./db";
import { aiReady, brandBlock, chat, extractObject } from "./ai";
import { brandOf, loadFactory } from "./pipeline";
import { InsufficientFunds, PRICES, charge, refund } from "./wallet";

export interface Rubric { name: string; share: number; desc: string }
export interface Strategy { positioning: string; pains: string[]; rubrics: Rubric[] }

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Приводит стратегию к допустимому виду: до 8 рубрик, доли целыми числами, в сумме 100. Пустая рубрика отбрасывается. */
export function cleanStrategy(raw: unknown): Strategy | null {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!o) return null;
  const rubrics = (Array.isArray(o.rubrics) ? o.rubrics : []).map((r) => {
    const x = r as Record<string, unknown>;
    return { name: clip(x?.name, 40), share: Math.max(0, Math.min(100, Math.round(Number(x?.share) || 0))), desc: clip(x?.desc, 200) };
  }).filter((r) => r.name).slice(0, 8);
  const pains = (Array.isArray(o.pains) ? o.pains : []).map((p) => clip(p, 160)).filter(Boolean).slice(0, 8);
  const positioning = clip(o.positioning, 500);
  if (!rubrics.length && !positioning && !pains.length) return null;
  const sum = rubrics.reduce((a, r) => a + r.share, 0);
  if (rubrics.length) {
    if (sum === 0) rubrics.forEach((r) => (r.share = Math.floor(100 / rubrics.length)));
    else if (sum !== 100) rubrics.forEach((r) => (r.share = Math.round((r.share / sum) * 100)));
    const fix = 100 - rubrics.reduce((a, r) => a + r.share, 0);
    if (fix) rubrics[0].share += fix;
  }
  return { positioning, pains, rubrics };
}

export const strategyOf = (brief: unknown): Strategy | null => cleanStrategy((brief as { strategy?: unknown } | null)?.strategy);

export async function saveStrategy(orgId: string, factoryId: string, s: Strategy | null): Promise<boolean> {
  const r = await q("update kz_factories set brief = case when $3::jsonb is null then brief - 'strategy' else brief || jsonb_build_object('strategy', $3::jsonb) end where id=$1 and org_id=$2 returning id", [factoryId, orgId, s ? JSON.stringify(s) : null]);
  return r.length > 0;
}

/** Стратегия контента по описанию бренда и завода: позиционирование, боли аудитории, рубрики с долями. Платно, при сбое возврат. */
export async function genStrategy(orgId: string, factoryId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!aiReady()) return { ok: false, error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  const fac = await loadFactory(orgId, factoryId);
  if (!fac) return { ok: false, error: "Завод не найден" };
  try { await charge(orgId, PRICES.strategy, "Контент-стратегия завода", factoryId); }
  catch (e) { if (e instanceof InsufficientFunds) return { ok: false, error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const top = await q<{ topic: string; views: number }>(
      `select i.topic,s.views from kz_publications p join kz_post_stats s on s.publication_id=p.id join kz_content_items i on i.id=p.item_id
        where i.factory_id=$1 and p.status='published' order by s.views desc limit 5`, [factoryId]);
    const comp = await q<{ body: string; views: number }>(
      `select cp.body,cp.views from kz_competitor_posts cp join kz_competitors c on c.id=cp.competitor_id where c.org_id=$1 and (c.brand_id=$2 or c.brand_id is null) order by cp.views desc limit 5`, [orgId, fac.brand_id]).catch(() => []);
    const user = `${brandBlock(brandOf(fac), fac.product, fac.niche)}\nФорматы завода: ${fac.formats.join(", ")}\n` +
      (top.length ? `Лучшие материалы бренда по просмотрам:\n${top.map((t) => `- ${t.topic} (${t.views})`).join("\n")}\n` : "") +
      (comp.length ? `Что заходит у конкурентов:\n${comp.map((t) => `- ${t.body.slice(0, 120)} (${t.views} просм.)`).join("\n")}\n` : "") +
      `\nСоставь контент-стратегию: "positioning" — как бренд подаёт себя в контенте, 1–2 предложения; "pains" — 4–6 болей или вопросов целевой аудитории, на которые отвечает контент; "rubrics" — 4–6 рубрик (постоянных тем), у каждой "name" до 30 знаков, "share" — доля в плане в процентах (в сумме 100), "desc" — о чём рубрика, до 120 знаков. Рубрики должны сочетаться: польза, доверие, продажи, вовлечение.\n` +
      `Формат: {"positioning":"...","pains":["..."],"rubrics":[{"name":"...","share":30,"desc":"..."}]}`;
    let st: Strategy | null = null;
    for (let a = 0; a < 2 && !st?.rubrics.length; a++)
      st = cleanStrategy(extractObject(await chat("plan", "Ты контент-стратег. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений и markdown.", a ? user + "\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ НЕВАЛИДНЫМ JSON." : user, { maxTokens: 1600, temperature: 0.6, timeoutMs: 50_000 })));
    if (!st?.rubrics.length) throw new Error("Модель не вернула рубрики");
    await saveStrategy(orgId, factoryId, st);
    return { ok: true };
  } catch (e) {
    await refund(orgId, PRICES.strategy, "ошибка стратегии", factoryId);
    return { ok: false, error: `Не получилось, деньги возвращены: ${(e as Error).message}` };
  }
}

/** Матрица плана: сколько материалов каждой рубрики стоит в ближайшие 4 недели (неделя с понедельника). */
export async function planMatrix(factoryId: string, rubrics: Rubric[]): Promise<{ weeks: string[]; rows: { name: string; counts: number[]; total: number }[]; untagged: number[] }> {
  const rows = await q<{ rubric: string | null; w: number; n: string }>(
    `select meta->>'rubric' rubric, floor((planned_for - date_trunc('week', current_date)::date) / 7.0)::int w, count(*) n
       from kz_content_items where factory_id=$1 and planned_for >= date_trunc('week', current_date)::date and planned_for < date_trunc('week', current_date)::date + 28
        and status not in ('rejected') group by 1,2`, [factoryId]);
  const start = new Date(); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const weeks = [0, 1, 2, 3].map((i) => { const d = new Date(start); d.setDate(start.getDate() + i * 7); return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }); });
  const known = new Set(rubrics.map((r) => r.name));
  const grid = (name: string | null) => [0, 1, 2, 3].map((w) => Number(rows.find((r) => (name === null ? !r.rubric || !known.has(r.rubric) : r.rubric === name) && r.w === w)?.n ?? 0));
  return { weeks, rows: rubrics.map((r) => { const counts = grid(r.name); return { name: r.name, counts, total: counts.reduce((a, b) => a + b, 0) }; }), untagged: grid(null) };
}
