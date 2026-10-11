/** Текстовые помощники автоленты: сходство текстов, признаки рекламы, чистка пересказа. Без нейросети и без затрат. */

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/https?:\/\/\S+/g, " ").replace(/[^a-zа-я0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Набор «шинглов» — последовательностей из 3 слов. Устойчив к перестановке предложений и мелким правкам. */
function shingles(s: string, n = 3): Set<string> {
  const w = norm(s).split(" ").filter(Boolean);
  const out = new Set<string>();
  if (w.length < n) { if (w.length) out.add(w.join(" ")); return out; }
  for (let i = 0; i <= w.length - n; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** Сходство 0..1 (индекс Жаккара по шинглам). 1 — одинаковые тексты, около 0 — разные. */
export function similarity(a: string, b: string): number {
  const x = shingles(a), y = shingles(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}

/** Доля слов, встречающихся и в пересказе, и в оригинале (мера «насколько скопировано»); нужна, чтобы отсеять пересказ-копию. */
export function copyRatio(source: string, rewrite: string): number {
  const x = shingles(source, 4), y = shingles(rewrite, 4);
  if (!y.size) return 0;
  let inter = 0;
  for (const t of y) if (x.has(t)) inter++;
  return inter / y.size;
}

const AD_STRONG = /(на правах рекламы|#реклама|\bреклама\b|erid[:\s=]|\berid\b|партн[её]рский материал|рекламодатель|ИНН\s*\d{10}|ОГРН\s*\d{13})/i;
const AD_SOFT = /(промокод|скидк[аи]\s*\d{1,2}\s*%|акци[яи]\s+(только|до)|успей(те)?\s+(купить|заказать)|закажи(те)?\s+(сейчас|по телефону)|переходи(те)?\s+по\s+ссылке|подписывайся(\s+на)?|забирай(те)?\s+(подарок|бонус)|розыгрыш|бесплатная\s+консультация|звоните?\s+по\s+номеру|пишите\s+в\s+(директ|личку|лс)|\+7[\s(-]*\d{3}|8[\s(-]*800)/gi;

/** Быстрая проверка рекламы без нейросети: strong — прямые юридические пометки, soft — число рекламных формулировок. */
export function adSignals(text: string): { strong: boolean; soft: number } {
  return { strong: AD_STRONG.test(text), soft: (text.match(AD_SOFT) ?? []).length };
}

/** Убирает из пересказа следы источника: ссылки, @упоминания, хештеги-метки, подписи «подписывайтесь», пометки рекламы. */
export function scrub(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/(^|\s)@[\w.]{3,}/g, "$1")
    .replace(/^[ \t]*(источник|via|подписаться|подписывайтесь|читайте нас|наш канал)[^\n]*(\n|$)/gim, "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

/** Нужная разметка текста для проверки совпадений с фильтрами (ключевые слова без учёта регистра и «ё»). */
export const hasWord = (text: string, words: string[]) => { const t = norm(text); return words.some((w) => { const x = norm(w); return x.length > 1 && t.includes(x); }); };
