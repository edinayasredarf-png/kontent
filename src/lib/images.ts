import sharp from "sharp";
import { baseUrl, chat, modelFor } from "./ai";
import { loadAsset, processImage, type AssetRow } from "./assets";
import { safeFetchBuffer } from "./safefetch";

export interface Kit {
  colors?: { hex: string; name?: string }[];
  fonts?: string;
  style?: string;           // пресет
  styleNotes?: string;      // свободное описание стиля
  imageMust?: string;       // что всегда есть на картинках
  imageNever?: string;      // чего не должно быть
  aspect?: "square" | "portrait" | "landscape";
  logoPos?: "none" | "br" | "bl" | "tr" | "tl";
  logoScale?: number;       // доля ширины, %
}

export const STYLES: Record<string, { label: string; prompt: string }> = {
  minimal: { label: "Минимализм", prompt: "minimalist, clean composition, lots of negative space, soft light" },
  futurism: { label: "Футуризм", prompt: "futuristic, high-tech, sleek surfaces, glow accents" },
  corporate: { label: "Корпоративный", prompt: "professional corporate style, trustworthy, balanced, modern office or business context" },
  popart: { label: "Яркий / Pop-Art", prompt: "bold pop-art, vivid saturated colors, strong contrast, playful" },
  pastel: { label: "Пастельный", prompt: "soft pastel palette, gentle gradients, calm and friendly mood" },
  dark: { label: "Тёмный", prompt: "dark moody background with accent lighting, premium feel" },
  photo: { label: "Фотореализм", prompt: "photorealistic, natural light, professional photography, shallow depth of field" },
  illustration: { label: "Иллюстрация", prompt: "flat vector illustration, clean shapes, cohesive palette" },
};

export const SIZES = { square: "1024x1024", portrait: "1024x1536", landscape: "1536x1024" } as const;

const HEX = /^#[0-9a-f]{6}$/i;
export function cleanKit(raw: unknown): Kit {
  const k = (raw ?? {}) as Kit;
  const t = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return {
    colors: Array.isArray(k.colors) ? k.colors.filter((c) => c && HEX.test(String(c.hex))).slice(0, 8).map((c) => ({ hex: String(c.hex).toLowerCase(), name: t(c.name, 30) })) : [],
    fonts: t(k.fonts, 120), style: k.style && STYLES[k.style] ? k.style : "", styleNotes: t(k.styleNotes, 600),
    imageMust: t(k.imageMust, 300), imageNever: t(k.imageNever, 300),
    aspect: k.aspect && k.aspect in SIZES ? k.aspect : "square",
    logoPos: k.logoPos && ["none", "br", "bl", "tr", "tl"].includes(k.logoPos) ? k.logoPos : "br",
    logoScale: Math.min(30, Math.max(6, Number(k.logoScale) || 14)),
  };
}

/** Описание картинки vision-моделью: из него потом строится текстовое «видение стиля» бренда. */
export async function describeImage(a: { data: Buffer; mime: string }, what: "reference" | "product"): Promise<string> {
  const base = baseUrl();
  const model = await modelFor("vision");
  if (!base || !model) throw new Error("Не выбрана vision-модель в «Настройках ИИ»");
  const key = process.env.SELFHOSTED_LLM_API_KEY?.trim();
  const ask = what === "product"
    ? "Опиши этот товар для генерации рекламных изображений: что это, форма, материалы, цвета, ключевые узнаваемые детали. 2–3 предложения, по-английски, без маркетинга."
    : "Опиши визуальный стиль этой картинки для художника: композиция, палитра, освещение, настроение, техника (фото/иллюстрация/3D), характерные приёмы. 2–3 предложения, по-английски. Не описывай сюжет подробно.";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({ model, max_tokens: 300, temperature: 0.2, messages: [{ role: "user", content: [{ type: "text", text: ask }, { type: "image_url", image_url: { url: `data:${a.mime};base64,${a.data.toString("base64")}` } }] }] }),
  });
  if (!res.ok) throw new Error(`Шлюз ${res.status} (vision ${model}): ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const out = (j.choices?.[0]?.message?.content ?? "").replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
  if (!out) throw new Error("Модель вернула пустое описание");
  return out.slice(0, 600);
}

export interface PromptInput { brandName: string; kit: Kit; topic: string; hook: string; body: string; notes: { kind: "reference" | "product"; text: string }[] }

/** Текстовая модель собирает один связный промпт: тема поста + стиль бренда. Текст на картинке запрещаем — логотип накладываем сами. */
export async function buildImagePrompt(i: PromptInput): Promise<string> {
  const k = i.kit;
  const style = [k.style && STYLES[k.style]?.prompt, k.styleNotes, ...i.notes.filter((n) => n.kind === "reference").map((n) => `Reference look: ${n.text}`)].filter(Boolean).join("; ");
  const product = i.notes.filter((n) => n.kind === "product").map((n) => n.text).join(" | ");
  const palette = (k.colors ?? []).map((c) => `${c.name ? c.name + " " : ""}${c.hex}`).join(", ");
  const out = await chat("imageprompt",
    "You write prompts for an image generation model. Output ONLY the prompt in English, 60–120 words, no quotes, no preface. The image must contain NO text, letters, numbers, logos or watermarks.",
    `Brand: ${i.brandName}\nPost topic: ${i.topic}\nHook: ${i.hook}\nPost text (excerpt): ${i.body.slice(0, 900)}\n` +
    (style ? `Visual style: ${style}\n` : "") + (palette ? `Brand color palette (use as dominant colors): ${palette}\n` : "") +
    (product ? `Product appearance (if the product is shown, keep it consistent): ${product}\n` : "") +
    (k.imageMust ? `Always include: ${k.imageMust}\n` : "") + (k.imageNever ? `Never include: ${k.imageNever}\n` : "") +
    `Create one image that illustrates the post's idea (a scene or concept, not a poster with words).`,
    { maxTokens: 400, temperature: 0.7 });
  return `${out.replace(/^["']|["']$/g, "").trim()} No text, no letters, no watermark.`.slice(0, 1800);
}

function fromDataUri(s: string): Buffer | null {
  const m = s.match(/^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  return m ? Buffer.from(m[1].replace(/\s/g, ""), "base64") : null;
}

interface ImgResp { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } | string }

async function toBuffer(item?: { b64_json?: string; url?: string }): Promise<Buffer | null> {
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) return item.url.startsWith("data:") ? fromDataUri(item.url) : (await safeFetchBuffer(item.url)).data;
  return null;
}

/**
 * Сначала OpenAI-совместимый /images/generations (так устроены image-модели шлюза). Если модель отвечает, что этот
 * endpoint ей не подходит, пробуем чат-вариант (модели, отдающие картинку в сообщении, как Gemini Image).
 */
export async function generateImage(prompt: string, aspect: keyof typeof SIZES): Promise<Buffer> {
  const base = baseUrl();
  if (!base) throw new Error("AI Gateway не настроен (SELFHOSTED_LLM_URL)");
  const model = await modelFor("image");
  if (!model) throw new Error("Не выбрана модель изображений. Откройте «Настройки ИИ» и выберите её в пункте «Генерация изображений»");
  const key = process.env.SELFHOSTED_LLM_API_KEY?.trim();
  const headers = { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) };
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(110_000) });

  let lastErr = "";
  // варианты параметров от строгого к простому: часть моделей не знает size или response_format
  const variants: Record<string, unknown>[] = [
    { model, prompt, n: 1, size: SIZES[aspect], response_format: "b64_json" },
    { model, prompt, n: 1, size: SIZES[aspect] },
    { model, prompt, n: 1 },
  ];
  for (const body of variants) {
    let res: Response;
    try { res = await post("/images/generations", body); }
    catch (e) { throw new Error((e as Error).name === "TimeoutError" ? `Модель изображений не ответила за 110 с (${model})` : `Шлюз недоступен: ${(e as Error).message}`); }
    const text = await res.text();
    let j: ImgResp = {}; try { j = JSON.parse(text); } catch { /* не JSON */ }
    if (res.ok) {
      const buf = await toBuffer(j.data?.[0]);
      if (buf?.length) return buf;
      lastErr = "модель вернула пустой результат";
      break;
    }
    lastErr = `${res.status}: ${(typeof j.error === "string" ? j.error : j.error?.message ?? text).slice(0, 200)}`;
    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) throw new Error(`Шлюз ${lastErr} (модель ${model})`);
    if (res.status === 404 || /not support|unsupported|chat/i.test(lastErr)) break; // endpoint не для этой модели → чат-вариант
  }

  // чат-вариант
  const res = await post("/chat/completions", { model, messages: [{ role: "user", content: prompt }], modalities: ["image", "text"], max_tokens: 1000 }).catch((e) => { throw new Error(`Шлюз недоступен: ${(e as Error).message}`); });
  if (!res.ok) throw new Error(`Не удалось сгенерировать (модель ${model}): ${lastErr || res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: unknown; images?: { image_url?: { url?: string } }[] } }[] };
  const msg = j.choices?.[0]?.message;
  const urls: string[] = [];
  for (const im of msg?.images ?? []) if (im.image_url?.url) urls.push(im.image_url.url);
  if (Array.isArray(msg?.content)) for (const p of msg!.content as { type?: string; image_url?: { url?: string } }[]) if (p.image_url?.url) urls.push(p.image_url.url);
  if (typeof msg?.content === "string") { const m = msg.content.match(/data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/\S+\.(?:png|jpe?g|webp)/i); if (m) urls.push(m[0]); }
  for (const u of urls) { const b = u.startsWith("data:") ? fromDataUri(u) : (await safeFetchBuffer(u)).data; if (b?.length) return b; }
  throw new Error(`Модель ${model} не вернула изображение${lastErr ? ` (${lastErr})` : ""}. Проверьте, что выбрана именно модель изображений`);
}

/** Накладывает логотип бренда в угол. Лого не «рисует» нейросеть — модели искажают буквы, поэтому оно приклеивается готовым файлом. */
export async function finalizeImage(raw: Buffer, logo: AssetRow | null, kit: Kit) {
  let img = sharp(raw, { limitInputPixels: 40_000_000 }).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 1024, h = meta.height ?? 1024;
  if (logo && kit.logoPos && kit.logoPos !== "none") {
    const lw = Math.round(w * ((kit.logoScale ?? 14) / 100));
    const l = await sharp(logo.data).resize({ width: lw, height: Math.round(lw * 1.2), fit: "inside" }).png().toBuffer({ resolveWithObject: true });
    const m = Math.round(w * 0.04);
    const left = kit.logoPos.endsWith("l") ? m : w - l.info.width - m;
    const top = kit.logoPos.startsWith("t") ? m : h - l.info.height - m;
    img = sharp(await img.png().toBuffer()).composite([{ input: l.data, left: Math.max(0, left), top: Math.max(0, top) }]);
  }
  const { data, info } = await img.flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { data, mime: "image/jpeg", width: info.width, height: info.height };
}

export { processImage, loadAsset };
