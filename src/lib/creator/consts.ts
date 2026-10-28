// Чистые данные и цены студии: без обращений к базе, поэтому доступны и в браузере.
/** Модель отрисовки слайдов, которую может выбрать клиент. Список задаёт администратор («Настройки ИИ → Модели для клиентов»). */
export interface ImgModel { id: string; label: string; hint: string; kop: number; /** текст на картинке модель рисует ровно */ text: boolean }

/** Качество результата: ширина готового слайда и параметр качества модели. Цена растёт множителем к цене модели. */
export const QUALITY = {
  "1k": { label: "1K", hint: "Для соцсетей достаточно", width: 1080, api: "medium", mult: 1 },
  "2k": { label: "2K", hint: "Чётче при увеличении", width: 1620, api: "high", mult: 1.7 },
  "4k": { label: "4K", hint: "Для печати и крупных экранов", width: 2160, api: "high", mult: 2.7 },
} as const;
export type QualityKey = keyof typeof QUALITY;
export const isQuality = (v: unknown): v is QualityKey => typeof v === "string" && v in QUALITY;

export const FORMATS = { portrait: { label: "4:5 лента", ratio: [4, 5] }, square: { label: "1:1 квадрат", ratio: [1, 1] } } as const;
export type FormatKey = keyof typeof FORMATS;

/** Цена одного слайда в копейках, округлённая до рубля: так цифра на кнопке совпадает с суммой в списании. */
export const slidePrice = (m: ImgModel, q: QualityKey) => Math.round((m.kop * QUALITY[q].mult) / 100) * 100;

/** Типы материалов в панели создания: порядок как в нижней полосе. `short` — подпись на вкладке. */
export const TYPES = [
  { kind: "carousel", short: "Карусель", noun: "карусель", what: "слайды с отдельной картинкой к каждому" },
  { kind: "post", short: "Пост", noun: "пост", what: "текст для ленты" },
  { kind: "reels", short: "Ролик", noun: "сценарий ролика", what: "сценарий короткого видео" },
  { kind: "story", short: "Сторис", noun: "сторис", what: "серия коротких экранов" },
  { kind: "article", short: "Лонгрид", noun: "лонгрид", what: "развёрнутая статья" },
  { kind: "seo", short: "SEO-статья", noun: "SEO-статью", what: "статья под поисковый запрос" },
  { kind: "poll", short: "Опрос", noun: "опрос", what: "вопрос аудитории" },
  { kind: "infographic", short: "Инфографика", noun: "инфографику", what: "данные одной картинкой" },
  { kind: "email", short: "Рассылка", noun: "рассылку", what: "письмо подписчикам" },
  { kind: "guide", short: "Гайд", noun: "гайд", what: "лид-магнит" },
  { kind: "contest", short: "Конкурс", noun: "конкурс", what: "механика и текст конкурса" },
] as const;
export const typeOf = (k: string) => TYPES.find((t) => t.kind === k) ?? TYPES[1];

/** Опции, которые клиент задаёт перед созданием любого материала. Пустое значение — «как в настройках завода / бренда». */
export interface CreateOpts {
  /** news | humor | sales | expert | info | friendly или пусто */ postType: string;
  /** ключ манеры письма из STYLES или пусто */ voice: string;
  /** «своя» аудитория вместо аудитории бренда; пусто — аудитория бренда */ audience: string;
}
export const NO_OPTS: CreateOpts = { postType: "", voice: "", audience: "" };

/** Референс: то, на что ИИ ориентируется. `visual` — арт-дирекшн для картинок, `text` — образец подачи для текста. */
export interface RefItem { id: string; title: string; thumb?: string; grad?: [string, string]; visual: string; text: string; origin: "example" | "upload" | "work" }

/** «Саммари» материала до создания: что получится и чем это хорошо. */
export interface Brief { angle: string; summary: string; whyFormat: string; whyAudience: string; outline: string[] }
