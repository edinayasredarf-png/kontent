export interface Kw { word: string; kind: "include" | "exclude" }
export interface Match { matched: string[]; score: number; excluded: boolean }

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Грубая основа: «закупками» ≈ «закупк». Не лингвистика, а срез окончания — хватает, чтобы ловить падежи. */
function stem(w: string): string {
  const n = w.length;
  return n >= 8 ? w.slice(0, n - 3) : n >= 6 ? w.slice(0, n - 2) : n >= 4 ? w.slice(0, n - 1) : w;
}
const L = "[\\p{L}\\p{N}]";

/** Слово ищется с начала слова; короткие (ИИ, НДС) — только целиком, иначе «ии» нашлось бы в десятках слов. */
function wordRe(w: string): RegExp {
  const s = stem(w);
  return new RegExp(`(?<!${L})${esc(s)}${w.length < 4 ? `(?!${L})` : ""}`, "iu");
}

/** Фраза из нескольких слов считается найденной, если найдены все её слова. */
function hit(text: string, phrase: string): boolean {
  const words = norm(phrase).split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => wordRe(w).test(text));
}

export function matchItem(title: string, body: string, kws: Kw[]): Match {
  const t = norm(title), full = norm(`${title} ${body}`);
  const matched: string[] = []; let score = 0;
  for (const k of kws) if (k.kind === "include" && hit(full, k.word)) { matched.push(k.word); score += hit(t, k.word) ? 2 : 1; }
  const excluded = kws.some((k) => k.kind === "exclude" && hit(full, k.word));
  return { matched, score, excluded };
}
