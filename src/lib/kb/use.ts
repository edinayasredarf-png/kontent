import { one } from "../db";
import { cleanProfile, cleanStyle, profileIsEmpty, styleIsEmpty, type Profile, type StyleGuide } from "./types";

const STEM = (w: string) => (w.length >= 8 ? w.slice(0, w.length - 3) : w.length >= 6 ? w.slice(0, w.length - 2) : w.length >= 4 ? w.slice(0, w.length - 1) : w);
const tokens = (t: string) => [...new Set(t.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4).map(STEM))];
/** Насколько фраза относится к теме: число общих основ слов. Нет темы — все равны. */
const rel = (topic: string[], text: string) => { if (!topic.length) return 0; const t = text.toLowerCase().replace(/ё/g, "е"); return topic.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0); };
function top<T>(items: T[], topic: string[], key: (x: T) => string, n: number): T[] {
  return items.map((x, i) => ({ x, i, r: rel(topic, key(x)) })).sort((a, b) => b.r - a.r || a.i - b.i).slice(0, n).map((e) => e.x);
}

/**
 * Текст для подсказки модели: кто мы, чем лучше конкурентов, подтверждённые факты (самые близкие к теме) и как мы пишем. Размер ограничен,
 * чтобы не раздувать каждый запрос; при известной теме выбираются наиболее подходящие факты, возражения и преимущества.
 */
export function kbBlock(profile: Profile, style: StyleGuide, topic = ""): string {
  const tp = tokens(topic);
  const out: string[] = [];
  if (!profileIsEmpty(profile)) {
    out.push("БАЗА ЗНАНИЙ О КОМПАНИИ (опирайся на неё; факты, цифры и сравнения бери только отсюда, ничего не выдумывай):");
    if (profile.about) out.push(`О нас: ${profile.about}`);
    if (profile.mission) out.push(`Миссия: ${profile.mission}`);
    if (profile.products.length) out.push(`Продукты и услуги: ${top(profile.products, tp, (p) => p.name + p.desc, 6).map((p) => `${p.name}${p.desc ? " — " + p.desc : ""}`).join("; ")}`);
    if (profile.audience.length) out.push(`Аудитория: ${top(profile.audience, tp, (a) => a.segment + a.needs, 3).map((a) => `${a.segment}${a.needs ? " (" + a.needs + ")" : ""}`).join("; ")}`);
    if (profile.usp.length) out.push(`УТП: ${profile.usp.slice(0, 4).join("; ")}`);
    if (profile.advantages.length) out.push(`Чем мы лучше: ${top(profile.advantages, tp, (a) => a, 5).join("; ")}`);
    if (profile.competitors.length) out.push(`Конкуренты и наше отличие: ${top(profile.competitors, tp, (c) => c.name + c.weakness + c.edge, 3).map((c) => `${c.name}: ${c.edge || c.weakness}`).join("; ")} (упоминай конкурентов по имени только если об этом просят)`);
    if (profile.proof.length) out.push(`Подтверждённые факты и доказательства: ${top(profile.proof, tp, (p) => p, 6).join("; ")}`);
    if (profile.objections.length) out.push(`Частые возражения: ${top(profile.objections, tp, (o) => o.q + o.a, 3).map((o) => `«${o.q}» — ${o.a}`).join("; ")}`);
    if (profile.terms.length) out.push(`Как мы называем: ${top(profile.terms, tp, (t) => t.term + t.meaning, 6).map((t) => `${t.term} — ${t.meaning}`).join("; ")}`);
    if (profile.avoid.length) out.push(`НЕЛЬЗЯ утверждать или упоминать: ${profile.avoid.join("; ")}`);
  }
  if (!styleIsEmpty(style)) {
    out.push("СТИЛЬ ПИСЬМА БРЕНДА (пиши так, как пишет этот бренд):");
    if (style.voice) out.push(`Голос: ${style.voice}`);
    if (style.person) out.push(`Обращение: ${style.person}`);
    if (style.sentence) out.push(`Фразы и абзацы: ${style.sentence}`);
    if (style.structure.length) out.push(`Структура текстов: ${style.structure.join("; ")}`);
    if (style.openings.length) out.push(`Типичные начала: ${style.openings.slice(0, 3).join(" | ")}`);
    if (style.closings.length) out.push(`Типичные концовки: ${style.closings.slice(0, 3).join(" | ")}`);
    if (style.like.length) out.push(`Любимые слова и обороты: ${style.like.slice(0, 12).join(", ")}`);
    if (style.dislike.length) out.push(`Избегаем: ${style.dislike.slice(0, 12).join(", ")}`);
    if (style.formatting) out.push(`Оформление: ${style.formatting}`);
    if (style.rules.length) out.push(`Правила: ${style.rules.join("; ")}`);
    if (style.samples.length) out.push(`Образцы манеры (перенимай интонацию, содержание не копируй): ${style.samples.slice(0, 2).map((x) => `«${x}»`).join(" ")}`);
  }
  return out.join("\n").slice(0, 4200);
}

export interface Kb { profile: Profile; style: StyleGuide; analyzed_at: string | null; docs_count: number; style_hash: string | null }
export async function loadKb(orgId: string, brandId: string): Promise<Kb | null> {
  const r = await one<{ profile: unknown; style: unknown; analyzed_at: string | null; docs_count: number; style_hash: string | null }>("select profile,style,analyzed_at,docs_count,style_hash from kz_brand_kb where brand_id=$1 and org_id=$2", [brandId, orgId]).catch(() => null);
  return r ? { profile: cleanProfile(r.profile), style: cleanStyle(r.style), analyzed_at: r.analyzed_at, docs_count: r.docs_count, style_hash: r.style_hash } : null;
}
/** Готовый текст базы знаний бренда для темы; пустая строка, если базы нет. Сбой чтения не должен ломать генерацию. */
export async function kbText(orgId: string, brandId: string, topic = ""): Promise<string> {
  const kb = await loadKb(orgId, brandId);
  return kb ? kbBlock(kb.profile, kb.style, topic) : "";
}
