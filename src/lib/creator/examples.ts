import { q, one } from "../db";
import type { RefItem } from "./consts";

const KEY = "creator_examples";

/** Пример (референс) для галереи «Примеры»: картинка по ссылке, подпись и стиль, по которому ИИ повторит подачу на другую тему. */
export interface Example { kind: string; title: string; style: string; structure: string; img: string; grad: [string, string] }

const g = (kind: string, title: string, style: string, structure: string, a: string, b: string): Example => ({ kind, title, style, structure, img: "", grad: [a, b] });

/** Встроенные примеры работают сразу, без картинок из интернета. Администратор может заменить их своими («Настройки ИИ → Примеры для клиентов»). */
export const DEFAULT_EXAMPLES: Example[] = [
  g("carousel", "Неон и фиолетовый космос", "neon purple space, glowing gradients, bold 3D objects, high contrast, futuristic poster look, deep dark background", "список: 5 ошибок и как их исправить", "#4c1d95", "#0f0a2a"),
  g("carousel", "Тёплая еда на деревянном столе", "warm top-down food photography, rustic wooden table, natural window light, rich appetizing colors, shallow depth of field", "подборка: топ-5 рецептов с короткими подписями", "#b45309", "#451a03"),
  g("carousel", "Нежная пастель и мягкие формы", "soft pastel pink and cream palette, smooth rounded shapes, airy studio light, gentle shadows, skincare editorial feel", "развенчание мифов: миф → правда", "#f9a8d4", "#fdf2f8"),
  g("carousel", "Тёмный премиум", "dark premium minimalism, black and graphite, thin gold highlights, dramatic rim light, elegant negative space, cinematic", "экспертная серия: тезис → доказательство → вывод", "#27272a", "#0a0a0a"),
  g("carousel", "Яркий поп-арт", "bold pop-art illustration, saturated orange and pink, flat shapes with thick outlines, playful characters, sticker look", "обучение за 24 часа: шаги и результат", "#fb923c", "#e11d48"),
  g("carousel", "Чистый интерьер до и после", "clean interior photography, neutral light tones, natural daylight, wide angle, calm and spacious", "до/после и объяснение выбора", "#d6d3d1", "#78716c"),
  g("carousel", "Технологии и данные", "tech data-visualisation look, dark blue background, cyan and green glow, abstract network lines, hooded silhouette, educational", "обучающая серия: угроза → защита → чек-лист", "#0e7490", "#042f2e"),
  g("carousel", "Журнальная вырезка", "editorial paper collage, beige textured paper, torn edges, vintage photographs, serif accents, scrapbook mood", "история: контекст → события → вывод", "#d6c7a1", "#7c6a43"),
  g("carousel", "Лето, свежесть, цитрус", "fresh summer citrus palette, bright yellow and green, juicy macro photography, sunlit, crisp and energetic", "сезонное предложение: польза → варианты → призыв", "#facc15", "#16a34a"),
  g("carousel", "Минимализм и крупная типографика", "minimal swiss poster, one solid accent color on off-white, big simple geometric object, lots of white space", "короткие тезисы по одному на слайд", "#e4e4e7", "#2563eb"),
  g("post", "Продающий пост с хуком", "", "Хук-вопрос в первой строке → боль клиента → решение → выгода цифрой → призыв к действию", "#0d9488", "#134e4a"),
  g("post", "Экспертный разбор", "", "Тезис → 3 коротких аргумента с примером → вывод одной строкой → вопрос аудитории", "#4f46e5", "#1e1b4b"),
  g("post", "История клиента", "", "Ситуация до → что пробовали → что сделали вместе → результат в цифрах → мораль", "#c2410c", "#431407"),
  g("reels", "Сценарий «3 ошибки»", "", "Хук за 2 секунды → ошибка 1, 2, 3 по 5 секунд с картинкой → правильный вариант → призыв подписаться", "#be123c", "#4c0519"),
  g("reels", "Закулисье за 30 секунд", "", "Быстрые кадры процесса → один неожиданный факт → результат → призыв написать в директ", "#7c3aed", "#2e1065"),
];

/** Разбор строк администратора: «формат | подпись | стиль (англ.) | структура | ссылка на картинку». */
export function parseExamples(raw: string): Example[] {
  const out: Example[] = [];
  for (const line of raw.split("\n")) {
    const p = line.split("|").map((x) => x.trim());
    if (!p[0] || !/^[a-z]{3,12}$/.test(p[0]) || !p[1]) continue;
    const img = /^https:\/\/[^\s"'<>]{4,400}$/.test(p[4] ?? "") ? p[4] : "";
    out.push({ kind: p[0], title: p[1].slice(0, 60), style: (p[2] || "").slice(0, 500), structure: (p[3] || "").slice(0, 300), img, grad: ["#52525b", "#18181b"] });
  }
  return out.slice(0, 60);
}
export const examplesToText = (l: Example[]) => l.map((e) => [e.kind, e.title, e.style, e.structure, e.img].join(" | ")).join("\n");

export async function saveExamples(raw: string) {
  const list = parseExamples(raw);
  await q("insert into kz_kv(key,value,updated_at) values($1,$2::jsonb,now()) on conflict(key) do update set value=excluded.value, updated_at=now()", [KEY, JSON.stringify(list)]);
  return list.length;
}

export async function listExamples(): Promise<Example[]> {
  const r = await one<{ value: unknown }>("select value from kz_kv where key=$1", [KEY]).catch(() => null);
  const own = (Array.isArray(r?.value) ? (r!.value as Example[]) : []).filter((e) => e && typeof e.title === "string" && typeof e.kind === "string");
  return own.length ? own : DEFAULT_EXAMPLES;
}

/** Для клиента: пример превращается в референс. Для картинок важен `style`, для текста — `structure`. */
export const exampleRefs = (l: Example[]): (RefItem & { kind: string })[] => l.map((e, i) => ({
  id: `ex-${i}`, kind: e.kind, title: e.title, thumb: e.img || undefined, grad: e.grad, origin: "example" as const,
  visual: [e.style, e.structure && `Structure of the series: ${e.structure}`].filter(Boolean).join(". "),
  text: e.structure ? `Структура подачи: ${e.structure}` : "",
}));
