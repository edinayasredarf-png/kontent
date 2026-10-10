/** Макеты внутренних слайдов карусели. Чистые функции без зависимостей: их используют и рендер, и генерация текста, и редактор. */
export const LAYOUTS = {
  text: "Обычный: заголовок и текст",
  stat: "Цифра крупно",
  list: "Список пунктов",
  compare: "Было / стало",
  quote: "Цитата",
} as const;
export type SlideLayout = keyof typeof LAYOUTS;

/** Подсказки для редактора и промпта: как заполнять поля под каждый макет. */
export const LAYOUT_HINTS: Record<SlideLayout, string> = {
  text: "Заголовок и текст до 200 знаков",
  stat: "Заголовок — сама цифра (например 73% или х3), текст — что она значит",
  list: "Заголовок — тема, текст — 2–5 пунктов через « | »",
  compare: "Текст: «Было: … | Стало: …» (или Миф: … | Факт: …)",
  quote: "Заголовок — сама цитата, текст — кто это сказал",
};

export const isLayout = (v: unknown): v is SlideLayout => typeof v === "string" && v in LAYOUTS;

const split = (body: string) => body.split(/\s*\|\s*|\s*;\s*|\n|•/).map((x) => x.trim()).filter(Boolean);
export const parseList = (body: string) => split(body).slice(0, 5);

const PAIRS: [RegExp, string, string][] = [[/^миф(?![а-яё])/i, "МИФ", "ФАКТ"], [/^ошибка(?![а-яё])/i, "ОШИБКА", "ВЕРНО"], [/^до(?![а-яё])/i, "ДО", "ПОСЛЕ"], [/^было(?![а-яё])/i, "БЫЛО", "СТАЛО"]];
/** «Было: … | Стало: …» → две части с подписями. Нет разделителя — макет не подходит. */
export function parseCompare(body: string): { a: { label: string; text: string }; b: { label: string; text: string } } | null {
  const parts = body.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const strip = (s: string) => s.replace(/^[^:]{1,12}:\s*/, "");
  let la = "БЫЛО", lb = "СТАЛО";
  for (const [re, x, y] of PAIRS) if (re.test(parts[0])) { la = x; lb = y; break; }
  return { a: { label: la, text: strip(parts[0]) }, b: { label: lb, text: strip(parts[1]) } };
}

/**
 * Возвращает макет, который реально можно нарисовать по этому тексту: иначе «text». Обложка и призыв всегда обычные.
 * Так модель не может сломать слайд (например, длинный заголовок вместо цифры или список из одного пункта).
 */
export function fixLayout(layout: unknown, title: string, body: string, isContent: boolean): SlideLayout {
  if (!isContent || !isLayout(layout)) return "text";
  if (layout === "stat") return title.length <= 14 && /\d/.test(title) && body ? "stat" : "text";
  if (layout === "list") return parseList(body).length >= 2 ? "list" : "text";
  if (layout === "compare") return parseCompare(body) ? "compare" : "text";
  if (layout === "quote") return title.length >= 12 && title.length <= 160 ? "quote" : "text";
  return "text";
}
