/** Настройки потока автоленты. Всё приходит из формы и из JSON базы: каждое поле проверяется. */
export const TOPICS = ["происшествия", "экономика", "политика", "культура", "спорт", "наука и технологии", "общество", "здоровье", "образование", "транспорт и ЖКХ", "прочее"] as const;
export const TYPES: Record<string, string> = { news: "Новость", announcement: "Объявление", joke: "Юмор", ad: "Реклама", junk: "Мусор" };
export const SCOPES: Record<string, string> = { local: "Локальный", regional: "Региональный", federal: "Федеральный", world: "Мировой" };
export const REJECT: Record<string, string> = {
  no_text: "Нет текста", exclude: "Стоп-слово", include: "Нет нужных слов", ad: "Реклама", duplicate: "Дубль", junk: "Мусор", type: "Тип не подходит", topic: "Тема не подходит", scope: "Масштаб не подходит",
  geo: "Другой регион", low_fit: "Низкая «нашесть»", copy: "Пересказ слишком близок к оригиналу", ai_error: "Ошибка нейросети", manual: "Отклонено вручную",
};

export interface FlowSettings {
  mode: "approve" | "auto"; maxAgeHours: number; dedupe: boolean; minFit: number;
  topics: string[]; types: string[]; scopes: string[]; geo: string; include: string[]; exclude: string[];
  tone: string; examples: string; images: "none" | "own" | "original"; source: "none" | "link";
  dailyCap: number; quietFrom: number; quietTo: number; minGapMin: number;
}

const list = (v: unknown, max = 30) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((x) => String(x).trim().toLowerCase()).filter((x) => x.length > 1 && x.length <= 60).slice(0, max);
const int = (v: unknown, lo: number, hi: number, def: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

export function cleanFlowSettings(raw: unknown): FlowSettings {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, allowed: string[]) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => allowed.includes(x)))];
  return {
    mode: b.mode === "auto" ? "auto" : "approve", maxAgeHours: int(b.maxAgeHours, 1, 168, 24), dedupe: b.dedupe !== false, minFit: int(b.minFit, 0, 10, 0),
    topics: pick(b.topics, [...TOPICS]), types: pick(b.types, Object.keys(TYPES).filter((t) => t !== "ad" && t !== "junk")).length ? pick(b.types, Object.keys(TYPES).filter((t) => t !== "ad" && t !== "junk")) : ["news", "announcement"],
    scopes: pick(b.scopes, Object.keys(SCOPES)), geo: String(b.geo ?? "").trim().slice(0, 100), include: list(b.include), exclude: list(b.exclude),
    tone: String(b.tone ?? "").replace(/\r/g, "").trim().slice(0, 600), examples: String(b.examples ?? "").replace(/\r/g, "").trim().slice(0, 3000),
    images: b.images === "own" || b.images === "original" ? b.images : "none", source: b.source === "link" ? "link" : "none",
    dailyCap: int(b.dailyCap, 1, 200, 20), quietFrom: int(b.quietFrom, 0, 23, 23), quietTo: int(b.quietTo, 0, 23, 7), minGapMin: int(b.minGapMin, 0, 720, 10),
  };
}

/** Час в Москве (0–23): окно тихих часов считаем по московскому времени, как расписание заводов. */
export const mskHour = (d = new Date()) => Number(new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hour12: false, timeZone: "Europe/Moscow" }).format(d)) % 24;
/** Тихие часы: с quietFrom до quietTo, окно может переходить через полночь (23 → 7). from === to — без тихих часов. */
export const inQuiet = (h: number, from: number, to: number) => (from === to ? false : from < to ? h >= from && h < to : h >= from || h < to);
