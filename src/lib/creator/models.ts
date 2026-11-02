import { one, q } from "../db";
import { modelFor } from "../ai";
import { PRICES, ensurePrices } from "../wallet";
import type { ImgModel } from "./consts";
export * from "./consts";

const KEY = "creator_image_models";

/** «id | Название | Подсказка | цена ₽ | text» по строке. Пустые и битые строки пропускаем. */
export function parseModels(raw: string): ImgModel[] {
  const out: ImgModel[] = [];
  for (const line of raw.split("\n")) {
    const p = line.split("|").map((x) => x.trim());
    const price = Number(String(p[3] ?? "").replace(",", "."));
    if (!p[0] || !/^[\w./:@+-]{2,120}$/.test(p[0]) || !(price >= 0) || !Number.isFinite(price)) continue;
    out.push({ id: p[0], label: (p[1] || p[0]).slice(0, 40), hint: (p[2] || "").slice(0, 80), kop: Math.round(price * 100), text: /^(text|да|yes|1)$/i.test(p[4] ?? "") });
  }
  return out.slice(0, 12);
}
export const modelsToText = (m: ImgModel[]) => m.map((x) => `${x.id} | ${x.label} | ${x.hint} | ${x.kop / 100}${x.text ? " | text" : ""}`).join("\n");

export async function saveModels(raw: string) {
  const list = parseModels(raw);
  await q("insert into kz_kv(key,value,updated_at) values($1,$2::jsonb,now()) on conflict(key) do update set value=excluded.value, updated_at=now()", [KEY, JSON.stringify(list)]);
  return list.length;
}

/** Модели для клиентов. Администратор ничего не задал — одна «Стандарт» на общей модели изображений по цене слайда карусели. */
export async function imageModels(): Promise<ImgModel[]> {
  await ensurePrices();
  const r = await one<{ value: unknown }>("select value from kz_kv where key=$1", [KEY]).catch(() => null);
  const list = (Array.isArray(r?.value) ? (r!.value as ImgModel[]) : []).filter((m) => m && typeof m.id === "string" && Number.isFinite(m.kop));
  if (list.length) return list;
  const def = await modelFor("image");
  return def ? [{ id: def, label: "Стандарт", hint: "Основная модель платформы", kop: PRICES.carousel_slide, text: true }] : [];
}

/** Только текстовые модели, уже назначенные администратором рабочим задачам.
 * Не обращаемся к медленному gateway /models при открытии страницы. */
export async function textModels(): Promise<string[]> {
  const routes = await q<{model: string}>("select distinct model from kz_ai_routes where task in ('default','post','article','reels','carousel','plan','assistant') and model<>''").catch(() => []);
  const fallback = await modelFor("post");
  return [...new Set([fallback, ...routes.map(r => r.model)].filter(Boolean))];
}
export async function validateTextModel(model?: string): Promise<string> {
  if (!model) return "";
  if (!(await textModels()).includes(model)) throw new Error("Модель недоступна. Обновите страницу и выберите модель из списка.");
  return model;
}
