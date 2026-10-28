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
