/** Настройки контента завода: хранятся в factories.brief (jsonb) рядом с флагом «картинки». Всё, что приходит из формы, проходит cleanSettings. */
export const POST_TYPES: Record<string, string> = { news: "Новостные", humor: "Юмористические", sales: "Продающие", expert: "Экспертные", info: "Информационные", friendly: "Дружелюбные" };
export const HASHTAGS = { none: "Без хештегов", few: "2–3 хештега", many: "5–8 хештегов" } as const;
export const EMOJI = { none: "Без эмодзи", moderate: "Умеренно", many: "Много" } as const;
export const LENGTHS = { short: "Короткие (до 700 знаков)", long: "Длинные (1200–1800 знаков)" } as const;
export const CAROUSEL_STYLES = { brand: "Фирменный цвет", light: "Светлая", dark: "Тёмная" } as const;

export interface ContentSettings {
  postTypes: string[]; length: keyof typeof LENGTHS; examples: string; link: string; cta: string;
  hashtags: keyof typeof HASHTAGS; emoji: keyof typeof EMOJI;
  /** Учитывать результаты прошлых публикаций бренда (самообучение). */ learn: boolean;
  /** Служебное: текст выводов из статистики, подставляется перед генерацией и не сохраняется. */ learnings: string;
  slides: number; carouselStyle: keyof typeof CAROUSEL_STYLES; carouselCover: "plain" | "ai"; carouselFormat: "portrait" | "square";
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");

/** Ссылка только http/https без логина и пароля: она попадёт в посты, поэтому «javascript:» и подобное недопустимы. */
export function cleanLink(v: unknown): string {
  const s = str(v, 300);
  if (!s) return "";
  try { const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`); return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password ? u.toString() : ""; } catch { return ""; }
}

export function cleanSettings(raw: unknown): ContentSettings {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const types = Array.isArray(b.postTypes) ? [...new Set(b.postTypes.map(String).filter((t) => t in POST_TYPES))] : [];
  return {
    postTypes: types, length: pick(b.length, Object.keys(LENGTHS) as (keyof typeof LENGTHS)[], "short"),
    examples: str(b.examples, 3000), link: cleanLink(b.link), cta: str(b.cta, 200),
    hashtags: pick(b.hashtags, Object.keys(HASHTAGS) as (keyof typeof HASHTAGS)[], "few"), emoji: pick(b.emoji, Object.keys(EMOJI) as (keyof typeof EMOJI)[], "moderate"),
    learn: b.learn !== false, learnings: "",
    slides: Math.min(10, Math.max(4, Math.round(Number(b.slides)) || 6)),
    carouselStyle: pick(b.carouselStyle, Object.keys(CAROUSEL_STYLES) as (keyof typeof CAROUSEL_STYLES)[], "brand"),
    carouselCover: b.carouselCover === "ai" ? "ai" : "plain", carouselFormat: b.carouselFormat === "square" ? "square" : "portrait",
  };
}

/** Блок правил для промпта. kind: пост/сторис/статья и т. д.; тип поста — один, выбранный для конкретной идеи. */
export function styleBlock(s: ContentSettings, kind: string, postType?: string): string {
  const lines: string[] = [];
  const t = postType && postType in POST_TYPES ? postType : s.postTypes[0];
  if (t) lines.push(`Тип поста: ${POST_TYPES[t].toLowerCase()}.`);
  if (kind === "post" || kind === "story") lines.push(`Длина: ${s.length === "long" ? "длинный пост, 1200–1800 знаков, с абзацами" : "короткий пост, до 700 знаков"}.`);
  lines.push(s.emoji === "none" ? "Эмодзи не использовать." : s.emoji === "many" ? "Эмодзи использовать щедро, но к месту." : "Эмодзи — умеренно, 1–3 на текст.");
  lines.push(s.hashtags === "none" ? "Хештеги не добавлять." : s.hashtags === "many" ? "В конце добавь 5–8 тематических хештегов." : "В конце добавь 2–3 тематических хештега.");
  if (s.cta) lines.push(`Призыв к действию (используй близко к этому смыслу): «${s.cta}».`);
  if (s.link) lines.push(`Ссылка для читателя: ${s.link} — вставь её в конце как есть, ничего не меняя и не придумывая другие ссылки.`);
  if (s.examples) lines.push(`Примеры постов автора. Перенимай манеру: длину фраз, интонацию, как начинаются и заканчиваются тексты. Содержание и факты из примеров НЕ копируй:\n---\n${s.examples}\n---`);
  if (s.learnings) lines.push(s.learnings);
  return lines.join("\n");
}
