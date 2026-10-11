import { brandBlock, chat, extractObject, type BrandCtx } from "../ai";
import { TOPICS, type FlowSettings } from "./settings";
import { copyRatio, scrub } from "./text";

export interface Classification { type: string; topic: string; scope: string; fit: number; region: string; ad: boolean; urgency: number; reason: string }

const num = (v: unknown, lo: number, hi: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def; };

/** Разбор новости: тип, тема, масштаб, «нашесть» для аудитории канала, регион, признак рекламы. Одна недорогая модель. */
export async function classify(b: BrandCtx, s: FlowSettings, text: string): Promise<Classification> {
  const system = "Ты редактор новостного канала. Отвечай ТОЛЬКО валидным JSON-объектом без пояснений и markdown.";
  const user = `${brandBlock(b, "", "")}\n${s.geo ? `Регион канала: ${s.geo}\n` : ""}\nНовость:\n«${text.slice(0, 2500)}»\n\n` +
    `Определи: "type" — news (новость), announcement (объявление или анонс события), joke (юмор), ad (реклама товара, услуги, канала, любая платная или продающая публикация), junk (мусор, спам, бессмыслица);\n"topic" — одна из: ${TOPICS.join(", ")};\n"scope" — local, regional, federal или world;\n"fit" — от 0 до 10, насколько новость интересна аудитории этого канала;\n"region" — регион или город из текста, если есть, иначе пустая строка;\n"ad" — true, если это реклама (даже скрытая: продающий тон, призыв купить, контакты продавца);\n"urgency" — от 0 до 10;\n"reason" — одна короткая фраза.\n` +
    `Формат: {"type":"news","topic":"общество","scope":"local","fit":7,"region":"","ad":false,"urgency":3,"reason":"..."}`;
  let o: Record<string, unknown> | null = null;
  for (let a = 0; a < 2 && !o; a++) o = extractObject(await chat("idea", system, a ? user + "\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ НЕВАЛИДНЫМ JSON." : user, { maxTokens: 300, temperature: 0.1, timeoutMs: 30_000 }));
  if (!o) throw new Error("Модель не вернула разбор новости");
  const type = ["news", "announcement", "joke", "ad", "junk"].includes(String(o.type)) ? String(o.type) : "news";
  return {
    type: o.ad === true ? "ad" : type, topic: (TOPICS as readonly string[]).includes(String(o.topic)) ? String(o.topic) : "прочее",
    scope: ["local", "regional", "federal", "world"].includes(String(o.scope)) ? String(o.scope) : "regional", fit: num(o.fit, 0, 10, 5),
    region: String(o.region ?? "").slice(0, 100), ad: o.ad === true || type === "ad", urgency: num(o.urgency, 0, 10, 3), reason: String(o.reason ?? "").slice(0, 200),
  };
}

/** Судья дублей: одно ли это событие. Вызывается только для пограничных случаев сходства. */
export async function sameEvent(a: string, b: string): Promise<boolean> {
  const out = await chat("idea", "Ты редактор новостей. Отвечай одним словом: ДА или НЕТ.",
    `Это одно и то же событие (даже если сообщения написаны по-разному и с разными подробностями)?\n\nТекст 1:\n${a.slice(0, 1200)}\n\nТекст 2:\n${b.slice(0, 1200)}`, { maxTokens: 10, temperature: 0, timeoutMs: 20_000 });
  return /^\s*да/i.test(out.trim());
}

/**
 * Пересказ под голос канала: факты сохраняются, формулировки свои. Если результат остался слишком близок к оригиналу (общие фразы из 4 слов),
 * делаем вторую попытку с жёстким требованием, а при повторе возвращаем null: такой текст публиковать нельзя.
 */
export async function rewrite(b: BrandCtx, s: FlowSettings, original: string, extra = ""): Promise<string | null> {
  const system = "Ты редактор канала. Пиши по-русски. Не придумывай фактов, цифр, имён и цитат, которых нет в исходной новости. Не копируй формулировки исходника: пересказывай своими словами и своей структурой.";
  const base = `${brandBlock(b, "", "")}\n${s.tone ? `Голос канала: ${s.tone}\n` : ""}${s.examples ? `Примеры постов канала (перенимай манеру: длину фраз, интонацию, начало и конец; факты из них не берём):\n---\n${s.examples.slice(0, 2000)}\n---\n` : ""}${extra ? `Пожелание редактора: ${extra}\n` : ""}\nИсходная новость:\n«${original.slice(0, 3500)}»\n\n` +
    `Напиши готовый пост для канала: 300–800 знаков, цепляющее начало, короткие абзацы. Убери из текста рекламные хвосты, ссылки, @упоминания, подписи вроде «подписывайтесь» и пометки источника. Верни только текст поста.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = scrub((await chat("post", system, attempt ? base + "\n\nПРЕДЫДУЩИЙ ВАРИАНТ БЫЛ СЛИШКОМ ПОХОЖ НА ОРИГИНАЛ. Перестрой текст полностью: другое начало, другой порядок, свои слова." : base, { maxTokens: 900, temperature: attempt ? 0.9 : 0.7, timeoutMs: 40_000 })).trim());
    if (out.length >= 80 && copyRatio(original, out) < 0.4) return out;
  }
  return null;
}
