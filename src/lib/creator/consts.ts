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
