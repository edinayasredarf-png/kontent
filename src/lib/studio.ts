import { one, q } from "./db";
import { aiReady, baseUrl, brandBlock, chat, modelFor, type BrandCtx } from "./ai";
import { buildImagePrompt, cleanKit, finalizeImage, generateImage, visionAsk } from "./images";
import { loadAsset, saveAsset } from "./assets";
import { PRICES, InsufficientFunds, charge, refund } from "./wallet";
import { CATALOG, LANG_PROMPT, STYLES, catalogByKey } from "./studio-catalog";
import { randomInt } from "node:crypto";

export interface Field { name: string; label: string; type: "text" | "textarea" | "select" | "image"; placeholder?: string; options?: [string, string][]; required?: boolean; max?: number; rows?: number }
export interface Tool { key: string; title: string; agent: string; desc: string; kind: "text" | "image" | "audio"; price: (i: Record<string, string>) => number; priceLabel: string; fields: Field[]; tags: string[] }

const brandField: Field = { name: "brand", label: "Бренд (стиль и тон)", type: "select", options: [["", "Без бренда"]] };

export const TOOLS: Tool[] = [
  { key: "text", tags: ["Текст", "Посты"], title: "Пост и подпись", agent: "SMM-менеджер", desc: "Пост, подпись, описание для соцсетей по вашему заданию.", kind: "text", price: () => PRICES.post, priceLabel: "20 ₽",
    fields: [brandField, { name: "format", label: "Что написать", type: "select", options: [["post", "Пост"], ["caption", "Короткая подпись к картинке"], ["story", "Текст для сторис"], ["ad", "Рекламное объявление"]] },
      { name: "brief", label: "О чём писать", type: "textarea", required: true, max: 2000, rows: 4, placeholder: "Тема, главная мысль, что должен сделать читатель" }] },
  { key: "hooks", tags: ["Текст", "Идеи", "Посты"], title: "Хуки", agent: "Генератор хуков", desc: "10 цепляющих первых строк для поста или ролика с разными приёмами.", kind: "text", price: () => PRICES.idea, priceLabel: "3 ₽",
    fields: [brandField, { name: "topic", label: "Тема материала", type: "textarea", required: true, max: 600, rows: 3 }] },
  { key: "script", tags: ["Видео", "Планирование"], title: "Сценарий ролика", agent: "Сценарист", desc: "Сценарий короткого видео: хук, кадры, закадровый текст, призыв.", kind: "text", price: () => PRICES.script, priceLabel: "30 ₽",
    fields: [brandField, { name: "idea", label: "Идея ролика", type: "textarea", required: true, max: 1000, rows: 3 },
      { name: "length", label: "Длительность", type: "select", options: [["15", "15 секунд"], ["30", "30 секунд"], ["60", "60 секунд"]] },
      { name: "tone", label: "Тон", type: "select", options: [["engaging", "Вовлекающий"], ["expert", "Экспертный"], ["humor", "С юмором"], ["calm", "Спокойный"]] }] },
  { key: "viral", tags: ["Идеи", "Видео"], title: "Вирусные идеи", agent: "Вирусный контент", desc: "10 идей с оценкой потенциала вирусности и объяснением, почему сработает.", kind: "text", price: () => PRICES.script, priceLabel: "30 ₽",
    fields: [brandField, { name: "product", label: "Продукт и его польза", type: "textarea", required: true, max: 1000, rows: 3 }, { name: "audience", label: "Кто аудитория", type: "textarea", max: 600, rows: 2 }] },
  { key: "image", tags: ["Изображения"], title: "Изображение", agent: "Дизайнер", desc: "Картинка по описанию в стиле вашего бренда, с логотипом в углу.", kind: "image", price: () => PRICES.image, priceLabel: "15 ₽",
    fields: [brandField, { name: "prompt", label: "Что нарисовать", type: "textarea", required: true, max: 1000, rows: 4, placeholder: "Сцена, объект, настроение. Текст на картинке модели рисуют плохо — лучше без него" },
      { name: "aspect", label: "Формат", type: "select", options: [["square", "Квадрат 1:1"], ["portrait", "Вертикальный"], ["landscape", "Горизонтальный"]] }] },
  { key: "cover", tags: ["Изображения", "Посты"], title: "Обложка карусели", agent: "Обложки каруселей", desc: "Яркая обложка для карусели Instagram или VK: сильная композиция без текста.", kind: "image", price: () => PRICES.image, priceLabel: "15 ₽",
    fields: [brandField, { name: "prompt", label: "Тема карусели", type: "textarea", required: true, max: 600, rows: 3 }] },
  { key: "voice", tags: ["Видео", "Инструменты"], title: "Озвучка", agent: "Озвучка", desc: "Текст в аудио голосом модели шлюза. Файл сохраняется в библиотеке.", kind: "audio", price: (i) => Math.max(1, Math.ceil((i.text ?? "").length / 1000)) * PRICES.tts, priceLabel: "5 ₽ за 1000 знаков",
    fields: [{ name: "text", label: "Текст для озвучки", type: "textarea", required: true, max: 3000, rows: 6 },
      { name: "voice", label: "Голос", type: "select", options: [["alloy", "alloy"], ["echo", "echo"], ["fable", "fable"], ["onyx", "onyx"], ["nova", "nova"], ["shimmer", "shimmer"]] }] },
];
/** Инструменты каталога (текстовые, на шаблонах заданий) и два особых: рандомайзер без нейросети и текст по картинке. */
const priceLabel = (kop: number) => (kop === 0 ? "бесплатно" : `${kop / 100} ₽`.replace(".", ","));
TOOLS.push(
  ...CATALOG.map((c): Tool => ({ key: c.key, tags: c.tags, title: c.title, agent: c.agent, desc: c.desc, kind: "text", price: () => c.kop, priceLabel: priceLabel(c.kop), fields: c.fields })),
  { key: "image2text", tags: ["Изображения", "Текст", "Посты"], title: "Текст по изображению", agent: "Копирайтер по фото", desc: "Создайте текст на основе изображения: пост, описание или объявление.", kind: "text", price: () => 2000, priceLabel: "20 ₽",
    fields: [brandField, { name: "image", label: "Изображение", type: "image", required: true }, { name: "what", label: "Что написать", type: "select", options: [["post", "Пост для соцсетей"], ["caption", "Короткая подпись"], ["ad", "Рекламное объявление"], ["card", "Описание товара"]] },
      { name: "extra", label: "Что важно учесть (необязательно)", type: "textarea", max: 600, rows: 3 },
      { name: "style", label: "Стиль текста", type: "select", options: Object.entries(STYLES).map(([k, v]) => [k, v.label] as [string, string]) }, { name: "lang", label: "Язык", type: "select", options: Object.entries(LANG_PROMPT).map(([k, v]) => [k, v] as [string, string]) }] },
  { key: "random", tags: ["Инструменты", "Посты"], title: "Рандомайзер для розыгрышей", agent: "Случайное число", desc: "Определите победителя честным случайным выбором из списка участников.", kind: "text", price: () => 0, priceLabel: "бесплатно",
    fields: [{ name: "list", label: "Участники (по одному в строке)", type: "textarea", required: true, max: 8000, rows: 8, placeholder: "@ivan\n@maria\n@petr" }, { name: "count", label: "Сколько победителей", type: "select", options: [["1", "1"], ["2", "2"], ["3", "3"], ["5", "5"], ["10", "10"]] }] },
);
/** Общие требования к стилю и языку: добавляются к заданию инструментов каталога. */
function styleLang(input: Record<string, string>, styled: boolean, langed: boolean): string {
  const st = styled || input.style ? STYLES[input.style ?? "normal"] : undefined;
  const lang = langed || input.lang ? LANG_PROMPT[input.lang ?? "ru"] ?? "русский" : "русский";
  return `${st?.hint ? `\nСтиль текста: ${st.label} — ${st.hint}. Соблюдай стиль, но не меняй смысл и факты.` : ""}\nЯзык ответа: ${lang}.`;
}

async function catalogText(key: string, input: Record<string, string>, bb: string): Promise<string> {
  if (key === "image2text") {
    const url = input.image ?? "";
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url) || url.length > 1_300_000) throw new Error("Загрузите изображение JPG, PNG или WebP (до 1 МБ после сжатия)");
    const seen = await visionAsk(url, "Опиши эту картинку подробно и точно: что изображено, детали, цвета, настроение, текст на ней если есть. Не додумывай того, чего не видно.");
    const task = { post: "пост для соцсетей, 500–900 знаков, с цепляющим началом и вопросом в конце", caption: "короткую подпись до 300 знаков", ad: "рекламное объявление: заголовок, 2–3 предложения, призыв", card: "описание товара: название, 3–5 преимуществ, для кого подходит" }[input.what ?? "post"] ?? "пост";
    return chat("post", SYS, `${bb}\nОписание картинки от наблюдателя:\n${seen}\n${input.extra ? `Что важно учесть: ${lim(input.extra, 600)}\n` : ""}Напиши ${task}. Опирайся только на описание картинки и пожелания, не выдумывай цен, фактов и характеристик.${styleLang(input, true, true)}`, { maxTokens: 1400, temperature: 0.7, timeoutMs: 55_000 });
  }
  const c = catalogByKey(key)!;
  const clean: Record<string, string> = {};
  for (const f of c.fields) clean[f.name] = lim(input[f.name], f.max ?? 4000);
  return chat(c.task ?? "post", SYS, `${bb}\n${c.build(clean)}${styleLang(clean, !!c.styled, !!c.langed)}`, { maxTokens: c.maxTokens ?? 2200, temperature: 0.8, timeoutMs: 58_000 });
}

/** Розыгрыш: случайный выбор криптографическим генератором, без нейросети и бесплатно. Дубли и пустые строки убираются, @ и регистр не различаются. */
function randomWinners(input: Record<string, string>): Out {
  const seen = new Set<string>(), names: string[] = [];
  for (const raw of (input.list ?? "").split("\n")) { const n = raw.trim().slice(0, 100); const k = n.toLowerCase().replace(/^@/, ""); if (n && !seen.has(k)) { seen.add(k); names.push(n); } }
  if (names.length < 2) return { error: "Нужно хотя бы 2 разных участника, по одному в строке" };
  const want = Math.min(Math.max(1, Number(input.count) || 1), names.length - 1 || 1, 10);
  const pool = [...names], win: string[] = [];
  for (let i = 0; i < want; i++) win.push(pool.splice(randomInt(pool.length), 1)[0]);
  const when = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  return { text: `Победител${win.length > 1 ? "и" : "ь"}:\n${win.map((w, i) => `${i + 1}. ${w}`).join("\n")}\n\nУчастников: ${names.length}. Выбор выполнен случайно ${when} (МСК).` };
}

export const toolByKey = (k: string) => TOOLS.find((t) => t.key === k);

export type Out = { text?: string; assetId?: string; mime?: string; error?: string };

async function brandCtx(orgId: string, id: string) {
  if (!id) return null;
  const b = await one<{ id: string; name: string; description: string; audience: string; tone: string; rules: { forbidden?: string[] }; kit: unknown }>(
    "select id,name,description,audience,tone,rules,kit from kz_brands where id=$1 and org_id=$2", [id, orgId]);
  return b ? { b, ctx: { name: b.name, description: b.description, audience: b.audience, tone: b.tone, forbidden: b.rules?.forbidden ?? [] } as BrandCtx } : null;
}

const SYS = "Ты опытный маркетолог и редактор. Пиши по-русски, конкретно, без воды и клише. Не выдумывай факты, цифры и цены.";
const lim = (s: string | undefined, n: number) => (s ?? "").replace(/\s+\n/g, "\n").trim().slice(0, n);

async function speech(text: string, voice: string): Promise<Buffer> {
  const base = baseUrl(), model = await modelFor("tts");
  if (!base) throw new Error("AI Gateway не настроен (SELFHOSTED_LLM_URL)");
  if (!model) throw new Error("Не выбрана модель озвучки. Выберите её в «Настройках ИИ» → «Озвучка текста»");
  const key = process.env.SELFHOSTED_LLM_API_KEY?.trim();
  const res = await fetch(`${base}/audio/speech`, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, signal: AbortSignal.timeout(100_000),
    body: JSON.stringify({ model, input: text, voice, response_format: "mp3" }) }).catch((e) => { throw new Error(`Шлюз недоступен: ${(e as Error).message}`); });
  if (!res.ok) throw new Error(`Шлюз ${res.status} (модель ${model}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error("Модель вернула пустой звук");
  if (buf.length > 6_000_000) throw new Error("Аудио получилось слишком большим — сократите текст");
  return buf;
}

/** Запуск инструмента: проверка → списание → работа → при любой ошибке возврат денег. */
export async function runTool(orgId: string, key: string, input: Record<string, string>): Promise<Out> {
  const tool = toolByKey(key);
  if (!tool) return { error: "Неизвестный инструмент" };
  if (key === "random") return randomWinners(input);
  if (!aiReady()) return { error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  for (const f of tool.fields) if (f.required && !lim(input[f.name], 1).length) return { error: `Заполните поле «${f.label}»` };
  for (const f of tool.fields) if (f.max && (input[f.name] ?? "").length > f.max) return { error: `Поле «${f.label}» длиннее ${f.max} знаков` };
  const bc = await brandCtx(orgId, input.brand ?? "");
  if (input.brand && !bc) return { error: "Бренд не найден" };
  const cost = tool.price(input);
  try { await charge(orgId, cost, `Студия: ${tool.title}`); }
  catch (e) { if (e instanceof InsufficientFunds) return { error: "Недостаточно средств на балансе" }; throw e; }
  try {
    const bb = bc ? brandBlock(bc.ctx, "", "") : "";
    if (catalogByKey(key) || key === "image2text") return { text: await catalogText(key, input, bb) };
    if (tool.kind === "text") {
      let user = "";
      if (key === "text") user = `${bb}\nЗадание: ${{ post: "пост для соцсетей, 600–900 знаков", caption: "короткая подпись к картинке, до 300 знаков", story: "3–4 коротких экрана текста для сторис", ad: "рекламное объявление: заголовок, текст до 400 знаков, призыв" }[input.format ?? "post"] ?? "пост"}.\nО чём: ${lim(input.brief, 2000)}\nВыведи только готовый текст.`;
      if (key === "hooks") user = `${bb}\nТема: ${lim(input.topic, 600)}\nСделай 10 хуков — первых строк, которые заставляют читать дальше. Каждый своим приёмом (вопрос, цифра, миф, боль, обещание, противоречие, история, провокация…). Формат: «1. [приём] текст». Без пояснений.`;
      if (key === "script") user = `${bb}\nИдея: ${lim(input.idea, 1000)}\nДлительность: ${input.length ?? 30} сек, тон: ${input.tone ?? "engaging"}.\nНапиши сценарий: ХУК (первые 2–3 сек), КАДРЫ по таймингу (что в кадре / закадровый текст), ПРИЗЫВ. Укажи, что нужно снять. Без выдуманных фактов о продукте.`;
      if (key === "viral") user = `${bb}\nПродукт: ${lim(input.product, 1000)}\nАудитория: ${lim(input.audience, 600) || "определи сам"}\nПредложи 10 идей коротких видео или постов с высоким шансом распространения. Для каждой: название, суть в 1–2 предложениях, ОЦЕНКА вирусности 1–100 и почему (эмоция, узнаваемость, польза, повод поделиться). Это экспертная оценка, не гарантия — так и напиши в конце одной строкой.`;
      return { text: await chat(key === "hooks" ? "idea" : key === "text" ? "post" : "reels", SYS, user, { maxTokens: 2200, temperature: 0.8, timeoutMs: 55_000 }) };
    }
    if (tool.kind === "image") {
      const kit = cleanKit(bc?.b.kit);
      const aspect = (["square", "portrait", "landscape"].includes(input.aspect ?? "") ? input.aspect : kit.aspect ?? "square") as "square" | "portrait" | "landscape";
      const topic = key === "cover" ? `Cover image for a social media carousel about: ${lim(input.prompt, 600)}. Bold, eye-catching composition with a clear focal point and empty space for a title.` : lim(input.prompt, 1000);
      const prompt = bc
        ? await buildImagePrompt({ brandName: bc.b.name, kit, topic, hook: "", body: "", notes: (await q<{ kind: "reference" | "product"; note: string }>("select kind,note from kz_assets where org_id=$1 and brand_id=$2 and kind in ('reference','product') and note<>'' order by created_at limit 6", [orgId, bc.b.id])).map((n) => ({ kind: n.kind, text: n.note })) })
        : `${topic}. No text, no letters, no watermark.`;
      const raw = await generateImage(prompt, aspect);
      const logo = bc ? await one<{ id: string }>("select id from kz_assets where org_id=$1 and brand_id=$2 and kind='logo'", [orgId, bc.b.id]) : null;
      const done = await finalizeImage(raw, logo ? await loadAsset(orgId, logo.id) : null, kit);
      return { assetId: await saveAsset(orgId, bc?.b.id ?? null, "studio", `${key}-${Date.now()}.jpg`, done, prompt), mime: "image/jpeg", text: prompt };
    }
    const buf = await speech(lim(input.text, 3000), ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].includes(input.voice ?? "") ? input.voice! : "alloy");
    return { assetId: await saveAsset(orgId, null, "studio", `voice-${Date.now()}.mp3`, { data: buf, mime: "audio/mpeg", width: 0, height: 0 }), mime: "audio/mpeg" };
  } catch (e) {
    await refund(orgId, cost, `ошибка: ${tool.title}`);
    return { error: `Не получилось, деньги возвращены: ${(e as Error).message}` };
  }
}
