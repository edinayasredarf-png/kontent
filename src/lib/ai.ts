import { one, q } from "./db";

/**
 * Все нейросети берутся из AI Gateway Timeweb — того же OpenAI-совместимого шлюза, что на единойсреде.рф.
 * Env (имена те же, что на единойсреде — можно скопировать как есть):
 *   SELFHOSTED_LLM_URL      — базовый URL до /v1
 *   SELFHOSTED_LLM_API_KEY  — ключ шлюза
 *   SELFHOSTED_LLM_MODEL    — модель по умолчанию
 */
const baseUrl = () => (process.env.SELFHOSTED_LLM_URL || process.env.SELFHOSTED_LLM_BASE_URL || "").trim().replace(/\/+$/, "");
export const aiReady = () => !!baseUrl();

export type AiTask = "plan" | "post" | "carousel" | "reels" | "article";
export const AI_TASKS: { key: AiTask; label: string; hint: string }[] = [
  { key: "plan", label: "Контент-план", hint: "Идеи и хуки. Нужна модель, хорошо держащая JSON" },
  { key: "post", label: "Пост", hint: "Короткие тексты" },
  { key: "carousel", label: "Карусель", hint: "Текст слайдов" },
  { key: "reels", label: "Сценарий ролика", hint: "Хук, кадры, CTA" },
  { key: "article", label: "Статья", hint: "Длинный текст — нужна сильная модель" },
];

export async function modelFor(task: AiTask): Promise<string> {
  const row = await one<{ model: string }>("select model from kz_ai_routes where task=$1", [task]).catch(() => null);
  return row?.model || process.env[`AI_MODEL_${task.toUpperCase()}`]?.trim() || process.env.SELFHOSTED_LLM_MODEL?.trim() || "";
}

export async function listGatewayModels(): Promise<string[]> {
  const base = baseUrl();
  if (!base) throw new Error("Шлюз не настроен: нет SELFHOSTED_LLM_URL");
  const key = process.env.SELFHOSTED_LLM_API_KEY?.trim();
  const res = await fetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Шлюз ответил ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json()) as { data?: { id?: string }[] };
  return (j.data ?? []).map((m) => m.id).filter((x): x is string => !!x).sort();
}

async function chat(task: AiTask, system: string, user: string, opts: { maxTokens: number; temperature: number; timeoutMs?: number }): Promise<string> {
  const base = baseUrl();
  if (!base) throw new Error("AI Gateway не настроен: задайте SELFHOSTED_LLM_URL");
  const model = await modelFor(task);
  if (!model) throw new Error("Не выбрана модель: задайте SELFHOSTED_LLM_MODEL или назначьте модель в «Настройки ИИ»");
  const key = process.env.SELFHOSTED_LLM_API_KEY?.trim();
  const timeoutMs = opts.timeoutMs ?? 50_000;
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model, temperature: opts.temperature, max_tokens: opts.maxTokens, stream: false, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
  } catch (e) {
    const t = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError";
    throw new Error(t ? `Шлюз не ответил за ${Math.round(timeoutMs / 1000)} с (модель ${model})` : `Шлюз недоступен: ${(e as Error).message}`);
  }
  if (!res.ok) throw new Error(`Шлюз ${res.status} (модель ${model}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  // «Думающие» модели присылают рассуждения в тегах — в контент они попадать не должны.
  const out = (j.choices?.[0]?.message?.content ?? "").replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
  if (!out) throw new Error(`Модель ${model} вернула пустой ответ`);
  return out;
}

export interface BrandCtx { name: string; description: string; audience: string; tone: string; forbidden: string[] }
export interface PlanIdea { topic: string; hook: string; kind: string }

const brandBlock = (b: BrandCtx, product: string, niche: string) =>
  `Бренд: ${b.name}\nОписание: ${b.description}\nАудитория: ${b.audience}\nТон: ${b.tone}\nПродукт/направление: ${product}\nНиша: ${niche}\n` +
  (b.forbidden.length ? `НЕЛЬЗЯ упоминать: ${b.forbidden.join(", ")}\n` : "");

/** Первый сбалансированный JSON-массив в тексте (модели любят добавлять пояснения до/после). */
function extractArray(text: string): unknown[] | null {
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = t.indexOf("[");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) { try { const v = JSON.parse(t.slice(start, i + 1)); return Array.isArray(v) ? v : null; } catch { return null; } }
  }
  return null;
}

/** Контент-план. Уже использованные темы передаём в промпт — так план не повторяется между запусками. */
export async function genPlan(b: BrandCtx, product: string, niche: string, kinds: string[], days: number, used: string[]): Promise<PlanIdea[]> {
  const system = "Ты контент-стратег. Отвечай ТОЛЬКО валидным JSON-массивом, без пояснений и без markdown.";
  const user = `${brandBlock(b, product, niche)}\nФорматы: ${kinds.join(", ")}\nСделай ровно ${days} идей, по одной на день. Углы подачи должны различаться (польза, кейс, миф, вопрос, новость).\n` +
    (used.length ? `Уже были, не повторять:\n- ${used.slice(0, 60).join("\n- ")}\n` : "") +
    `Формат ответа: [{"topic":"...","hook":"первая строка, цепляющая внимание","kind":"${kinds[0]}"}]`;
  let arr: unknown[] | null = null;
  for (let attempt = 0; attempt < 2 && !arr; attempt++) {
    arr = extractArray(await chat("plan", system, attempt ? user + "\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ НЕВАЛИДНЫМ JSON. Верни только JSON-массив." : user, { maxTokens: 4000, temperature: 0.7 }));
  }
  if (!arr) throw new Error("Модель не вернула валидный план");
  const ideas = (arr as Partial<PlanIdea>[]).filter((x) => x && x.topic).map((x) => ({ topic: String(x.topic), hook: String(x.hook ?? ""), kind: kinds.includes(String(x.kind)) ? String(x.kind) : kinds[0] }));
  if (!ideas.length) throw new Error("Модель вернула пустой план");
  return ideas.slice(0, days);
}

export async function genPost(b: BrandCtx, product: string, niche: string, topic: string, hook: string, kind: string): Promise<string> {
  const len = kind === "article" ? "800–1200 слов, заголовки H2" : kind === "carousel" ? "6 слайдов, каждый с пометкой «Слайд N:» и 1–2 короткими фразами" : kind === "reels" ? "сценарий ролика на 20 сек: хук, 3 кадра, CTA" : "600–900 знаков";
  const task: AiTask = kind === "article" ? "article" : kind === "carousel" ? "carousel" : kind === "reels" ? "reels" : "post";
  return chat(task,
    "Ты редактор бренда. Пиши по-русски, без воды и клише, без эмодзи-спама. Не выдумывай факты, цифры и цены — если данных нет, пиши без них. Выведи только готовый текст, без вступлений вроде «Вот текст».",
    `${brandBlock(b, product, niche)}\nФормат: ${kind}, объём: ${len}\nТема: ${topic}\nХук: ${hook}\nНапиши готовый текст.`,
    { maxTokens: kind === "article" ? 3500 : 1500, temperature: 0.7, timeoutMs: kind === "article" ? 55_000 : 45_000 });
}

export async function saveRoute(task: AiTask, model: string) {
  if (!model) await q("delete from kz_ai_routes where task=$1", [task]);
  else await q("insert into kz_ai_routes(task,model) values($1,$2) on conflict(task) do update set model=excluded.model, updated_at=now()", [task, model]);
}
