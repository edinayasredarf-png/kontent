import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.AI_MODEL || "claude-sonnet-5-5";
let client: Anthropic | null = null;
const api = () => (client ??= new Anthropic());

export const aiReady = () => !!process.env.ANTHROPIC_API_KEY;

async function text(system: string, user: string, max = 2000): Promise<string> {
  const r = await api().messages.create({ model: MODEL, max_tokens: max, system, messages: [{ role: "user", content: user }] });
  return r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

export interface BrandCtx { name: string; description: string; audience: string; tone: string; forbidden: string[] }
export interface PlanIdea { topic: string; hook: string; kind: string }

const brandBlock = (b: BrandCtx, product: string, niche: string) =>
  `Бренд: ${b.name}\nОписание: ${b.description}\nАудитория: ${b.audience}\nТон: ${b.tone}\nПродукт/направление: ${product}\nНиша: ${niche}\n` +
  (b.forbidden.length ? `НЕЛЬЗЯ упоминать: ${b.forbidden.join(", ")}\n` : "");

/** Контент-план. Передаём уже использованные темы — главный способ не повторяться между запусками. */
export async function genPlan(b: BrandCtx, product: string, niche: string, kinds: string[], days: number, used: string[]): Promise<PlanIdea[]> {
  const out = await text(
    "Ты контент-стратег. Отвечай ТОЛЬКО валидным JSON-массивом без пояснений и без markdown.",
    `${brandBlock(b, product, niche)}\nФорматы: ${kinds.join(", ")}\nСделай ${days} идей, по одной на день. Темы должны быть разные по углу подачи (польза, кейс, миф, вопрос, новость).\n` +
    (used.length ? `Уже были, не повторять:\n- ${used.slice(0, 60).join("\n- ")}\n` : "") +
    `Формат: [{"topic":"...","hook":"первая строка, цепляющая внимание","kind":"${kinds[0]}"}]`, 4000);
  const json = out.slice(out.indexOf("["), out.lastIndexOf("]") + 1);
  const arr = JSON.parse(json) as PlanIdea[];
  return arr.filter((x) => x.topic).map((x) => ({ topic: String(x.topic), hook: String(x.hook ?? ""), kind: kinds.includes(x.kind) ? x.kind : kinds[0] }));
}

export async function genPost(b: BrandCtx, product: string, niche: string, topic: string, hook: string, kind: string): Promise<string> {
  const len = kind === "article" ? "800–1200 слов, заголовки H2" : kind === "carousel" ? "6 слайдов, каждый с пометкой «Слайд N:» и 1–2 короткими фразами" : kind === "reels" ? "сценарий ролика на 20 сек: хук, 3 кадра, CTA" : "600–900 знаков";
  return text(
    "Ты редактор бренда. Пиши по-русски, без воды и клише, без эмодзи-спама. Не выдумывай факты, цифры и цены — если данных нет, пиши без них.",
    `${brandBlock(b, product, niche)}\nФормат: ${kind}, объём: ${len}\nТема: ${topic}\nХук: ${hook}\nНапиши готовый текст.`, kind === "article" ? 3500 : 1500);
}
