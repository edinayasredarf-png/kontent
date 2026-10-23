import { q } from "./db";
import { audit } from "./admin";
import { resetModelPrices } from "./billing";

/**
 * Прайс AI Gateway Timeweb (кабинет → Cloud AI → Gateway → Модели, снимок 23.10.2026): рубли за 1 млн токенов (вход / выход),
 * у моделей изображений по картинке — за штуку. Названия — как в кабинете; к id модели в шлюзе они сопоставляются по набору слов,
 * поэтому неоднозначные названия (одно имя с двумя ценами) автоматически не подставляются.
 */
export interface TwPrice { name: string; in: number; out: number; image?: number }
export const TIMEWEB_PRICES: TwPrice[] = [
  { name: "DeepSeek V4 Flash", in: 59, out: 178 }, { name: "Claude 4.6 Sonnet", in: 405, out: 2025 }, { name: "GPT-5.5", in: 676, out: 4050 }, { name: "Gemini 3.1 Flash Lite", in: 34, out: 203 },
  { name: "GPT 4o", in: 675, out: 2700 }, { name: "GPT 4.1 mini", in: 54, out: 216 }, { name: "GPT 4.1", in: 270, out: 1080 }, { name: "Text Embedding 3 Large", in: 45, out: 0 }, { name: "Grok Code Fast", in: 27, out: 203 },
  { name: "Claude 4.5 Haiku", in: 135, out: 1080 }, { name: "GPT 5.1", in: 162, out: 1350 }, { name: "GPT 5.2", in: 236, out: 1890 }, { name: "Qwen 3 Max", in: 162, out: 810 },
  { name: "YandexGPT 5.1 Pro", in: 410, out: 410 }, { name: "YandexGPT 5.1 Lite", in: 210, out: 210 }, { name: "Alice AI LLM", in: 510, out: 2030 }, { name: "Claude 4.6 Opus", in: 675, out: 3375 },
  { name: "Gemini 3.1 Pro Preview", in: 270, out: 1620 }, { name: "Qwen 3.5 Plus", in: 52, out: 324 }, { name: "Qwen 3.5 Flash", in: 14, out: 52 }, { name: "GPT 5.3 Codex", in: 236, out: 1890 },
  { name: "GPT 5.4", in: 338, out: 2025 }, { name: "Gemini 3 Pro Image Preview", in: 270, out: 16200 }, { name: "Gemini 3.1 Flash Image Preview", in: 68, out: 8100 }, { name: "GPT 5.4 Mini", in: 101, out: 608 },
  { name: "GPT 5.4 Nano", in: 27, out: 169 }, { name: "Qwen 3.6 Plus", in: 68, out: 405 }, { name: "Claude 4.7 Opus", in: 675, out: 3375 }, { name: "DeepSeek V4 Pro", in: 178, out: 535 }, { name: "Gemma 4", in: 189, out: 540 },
  { name: "Claude 4.8 Opus", in: 675, out: 3375 }, { name: "GPT-4o mini TTS", in: 81, out: 1620 }, { name: "Text Embedding 3 Small", in: 3, out: 0 }, { name: "Gemini Embedding 2", in: 27, out: 0 },
  { name: "Qwen Text Embedding v4", in: 9, out: 0 }, { name: "Yandex Text Embeddings (doc)", in: 10, out: 0 }, { name: "Yandex Text Embeddings (query)", in: 10, out: 0 }, { name: "Claude 5 Fable", in: 1350, out: 6750 },
  { name: "Text Embedding 005", in: 14, out: 0 }, { name: "Claude 5 Sonnet", in: 405, out: 2025 }, { name: "Gemini 3.5 Flash", in: 203, out: 1215 }, { name: "Grok 4.3", in: 169, out: 338 },
  { name: "Qwen 3.6 Flash", in: 34, out: 203 }, { name: "Qwen 3.7 Max", in: 338, out: 1013 }, { name: "Qwen 3.7 Plus", in: 54, out: 216 }, { name: "GLM 4.7", in: 81, out: 297 }, { name: "GLM 4.7 FlashX", in: 9, out: 54 },
  { name: "GPT-4o mini Transcribe", in: 405, out: 675 }, { name: "GPT-5.6 Sol", in: 540, out: 2700 }, { name: "GPT-5.6 Terra", in: 270, out: 1620 }, { name: "GPT-5.6 Luna", in: 27, out: 162 }, { name: "Grok 4.5", in: 270, out: 810 },
  { name: "GPT-4o Transcribe", in: 810, out: 1350 }, { name: "GPT OSS 120B", in: 20, out: 82 }, { name: "GPT Image 2", in: 675, out: 4050 }, { name: "Claude Opus 5", in: 675, out: 3375 }, { name: "Kimi K2.7 Code", in: 128, out: 540 },
  { name: "Kimi K3", in: 405, out: 2025 }, { name: "Gemini 3.6 Flash", in: 203, out: 1013 }, { name: "Gemini 3.7 Flash", in: 101, out: 506 }, { name: "Grok 4.6", in: 540, out: 1620 }, { name: "Qwen 3.8 Max", in: 270, out: 810 },
  { name: "FLUX.2 [pro]", in: 0, out: 0, image: 4.05 }, { name: "FLUX.2 [klein] 9B", in: 0, out: 0, image: 2.025 }, { name: "FLUX.2 [max]", in: 0, out: 0, image: 9.45 }, { name: "GLM 5.3 Flash", in: 20, out: 68 },
  { name: "Gemini 3.8 Flash", in: 101, out: 506 }, { name: "GPT-6 Astra", in: 1350, out: 6750 }, { name: "GPT Image 2.5 Flare", in: 675, out: 4050 }, { name: "GPT Image 2.5 Sunburst", in: 675, out: 4050 },
  { name: "Claude 5.1 Fable", in: 1350, out: 6750 }, { name: "DeepSeek V4.1 Flash", in: 41, out: 162 }, { name: "Jev", in: 6, out: 0 }, { name: "Jev 1.13.0", in: 6, out: 0 }, { name: "Grok 4.7", in: 270, out: 810 },
  { name: "Claude Opus 5.5", in: 540, out: 2700 }, { name: "GPT-6 Sol", in: 270, out: 1350 }, { name: "GPT-6 Luna", in: 14, out: 68 }, { name: "GPT-6.1 Sol", in: 270, out: 1350 }, { name: "Claude 5.5 Haiku", in: 14, out: 68 },
  { name: "Claude 5.5 Sonnet", in: 270, out: 1350 }, { name: "Gemini 3.5 Flash Lite", in: 41, out: 338 }, { name: "Qwen 3.8 Flash", in: 20, out: 63 }, { name: "Nano Banana 2.1", in: 203, out: 4050 },
  { name: "Gemini 4 Argon", in: 270, out: 1350 }, { name: "MiMo V2.6 Pro", in: 59, out: 117 }, { name: "MiMo V2.6 Flash", in: 19, out: 38 }, { name: "MiMo V2.6 Pro UltraSpeed", in: 587, out: 1175 }, { name: "Gemini 3 Pro Image", in: 270, out: 16200 },
  // в кабинете у этих названий по две цены (разные размещения): автоматически не подставляются, цену нужно выбрать вручную
  { name: "GLM 5.2", in: 189, out: 594 }, { name: "GLM 5.2", in: 267, out: 1120 }, { name: "Kimi K2.6", in: 236, out: 979 }, { name: "Kimi K2.6", in: 128, out: 540 }, { name: "GLM 5.3", in: 189, out: 594 }, { name: "GLM 5.3", in: 267, out: 1120 },
];

/** Набор слов названия или id модели: без провайдера до «/», версии «4-6» и «4.6» считаются одним, скобки и регистр не важны. */
export function wordsOf(s: string): string {
  const base = s.includes("/") ? s.slice(s.lastIndexOf("/") + 1) : s;
  const t = base.toLowerCase().replace(/(\d)[-_](\d)/g, "$1.$2").replace(/[\[\]()]/g, " ").split(/[^a-z0-9.]+/).filter(Boolean);
  return [...new Set(t)].sort().join(" ");
}

/** Цена для id модели из шлюза: однозначное совпадение по словам; иначе null (и признак «неоднозначно»). */
export function priceForModel(id: string): { price: TwPrice | null; ambiguous: boolean } {
  const w = wordsOf(id);
  const hits = TIMEWEB_PRICES.filter((p) => wordsOf(p.name) === w);
  if (hits.length === 1) return { price: hits[0], ambiguous: false };
  return { price: null, ambiguous: hits.length > 1 };
}

type Actor = { id: string; email: string };
export interface PullResult { total: number; added: number; priced: number; unpriced: string[]; ambiguous: string[]; kept: number }

/** Заводит в прайсе моделей все модели шлюза. Уже заполненные не трогаем; новым подставляем цену из прайса Timeweb, если она однозначна. */
export async function addGatewayModels(actor: Actor, ids: string[]): Promise<PullResult> {
  const have = new Set((await q<{ model: string }>("select model from kz_ai_models")).map((r) => r.model));
  const res: PullResult = { total: ids.length, added: 0, priced: 0, unpriced: [], ambiguous: [], kept: 0 };
  for (const id of ids) {
    if (have.has(id)) { res.kept++; continue; }
    const { price, ambiguous } = priceForModel(id);
    // цены кабинета в рублях за 1 млн; у нас они хранятся в копейках
    await q("insert into kz_ai_models(model,in_per_m_kop,out_per_m_kop,per_image_kop,per_call_kop,note) values($1,$2,$3,$4,0,$5) on conflict(model) do nothing",
      [id, (price?.in ?? 0) * 100, (price?.out ?? 0) * 100, (price?.image ?? 0) * 100, price ? "из прайса Timeweb (кабинет, 23.10.2026)" : ambiguous ? "у названия две цены в кабинете: выберите вручную" : "цены нет в прайсе: заполните вручную"]);
    res.added++;
    if (price) res.priced++; else if (ambiguous) res.ambiguous.push(id); else res.unpriced.push(id);
  }
  resetModelPrices();
  if (res.added) {
    // уже записанные вызовы этих моделей получают стоимость
    await q(`update kz_ai_usage a set cost_kop = a.tokens_in::numeric/1e6*m.in_per_m_kop + a.tokens_out::numeric/1e6*m.out_per_m_kop + a.images*m.per_image_kop + m.per_call_kop, priced=true from kz_ai_models m where m.model=a.model and not a.priced and (m.in_per_m_kop>0 or m.out_per_m_kop>0 or m.per_image_kop>0)`);
    await audit(actor, "ai_models.pull", "ai_model", "gateway", { added: res.added, priced: res.priced });
  }
  return res;
}
