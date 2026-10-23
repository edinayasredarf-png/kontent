"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./admin";
import { deleteModelPrice, resetPrices, saveModelPrice, savePrices, setUnlimitedUntil } from "./admin-econ";
import { DEFAULT_PRICES } from "./wallet";
import { listGatewayModels } from "./ai";
import { addGatewayModels } from "./timeweb-prices";
import { importTimewebLogs } from "./timeweb-logs";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const rubNum = (v: string) => Number(v.replace(",", ".").replace(/\s/g, ""));
const out = (r: { ok: boolean; error?: string; message?: string }) => (r.ok ? { ok: r.message ?? "Готово" } : { error: r.error });
const refresh = () => { revalidatePath("/app", "layout"); revalidatePath("/"); }; // и публичная страница с ценами

/** Цены списания: поля p_<ключ> в рублях. Сохранённое действует сразу во всех местах, где цена показывается или списывается. */
export async function savePricesAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  const values: Record<string, number> = {};
  for (const key of Object.keys(DEFAULT_PRICES)) {
    const raw = s(f, `p_${key}`);
    if (!raw) continue;
    const v = rubNum(raw);
    if (!Number.isFinite(v) || v < 0) return { error: `Неверная цена: ${raw}` };
    values[key] = Math.round(v * 100);
  }
  try { const r = await savePrices(c.user, values); refresh(); return out(r); } catch (e) { return { error: (e as Error).message }; }
}
export async function resetPricesAction(): Promise<void> {
  const c = await requireAdmin();
  await resetPrices(c.user); refresh();
}
export async function saveModelPriceAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  const r = await saveModelPrice(c.user, { model: s(f, "model"), inM: rubNum(s(f, "inM") || "0"), outM: rubNum(s(f, "outM") || "0"), image: rubNum(s(f, "image") || "0"), call: rubNum(s(f, "call") || "0"), note: s(f, "note") });
  revalidatePath("/app/admin/prices"); revalidatePath("/app/admin/economy");
  return out(r);
}
export async function deleteModelPriceAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  const r = await deleteModelPrice(c.user, s(f, "model"));
  revalidatePath("/app/admin/prices");
  return out(r);
}
export async function setUnlimitedAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  const r = await setUnlimitedUntil(c.user, s(f, "org"), Math.round(Number(s(f, "days"))));
  revalidatePath(`/app/admin/orgs/${s(f, "org")}`); revalidatePath("/app/admin/orgs"); revalidatePath("/app/admin/economy");
  return out(r);
}

const rubFmt = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;

/** Кнопка «Подтянуть модели из шлюза»: список моделей из AI Gateway попадает в прайс, цены подставляются из прайса Timeweb, где они однозначны. */
export async function pullGatewayModelsAction(_: unknown, __?: FormData) {
  const c = await requireAdmin();
  let ids: string[];
  try { ids = await listGatewayModels(); } catch (e) { return { error: (e as Error).message }; }
  if (!ids.length) return { error: "Шлюз не вернул ни одной модели" };
  const r = await addGatewayModels(c.user, ids);
  revalidatePath("/app/admin/prices"); revalidatePath("/app/admin/economy");
  const show = (a: string[]) => a.slice(0, 8).join(", ") + (a.length > 8 ? ` и ещё ${a.length - 8}` : "");
  return { ok: [`Моделей в шлюзе: ${r.total}. Уже были в прайсе: ${r.kept}. Добавлено: ${r.added}, из них сразу с ценой: ${r.priced}.`,
    r.ambiguous.length ? `У этих названий в кабинете две цены, выберите вручную: ${show(r.ambiguous)}.` : "", r.unpriced.length ? `Цены нет в прайсе, заполните: ${show(r.unpriced)}.` : ""].filter(Boolean).join("\n") };
}

/** Загрузка CSV-логов Timeweb: ставки для моделей без цены берутся из фактических списаний, плюс сверка с нашим учётом. */
export async function importLogsAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Выберите файл CSV с логами" };
  if (file.size > 3_000_000) return { error: "Файл больше 3 МБ: выгрузите логи за меньший период" };
  try {
    const r = await importTimewebLogs(c.user, await file.text());
    revalidatePath("/app/admin/prices"); revalidatePath("/app/admin/economy");
    const d = (x: string | null) => (x ? new Date(x).toLocaleDateString("ru-RU") : "?");
    return { ok: [`Запросов в файле: ${r.rows} (${d(r.from)} — ${d(r.to)}). Фактически списал Timeweb: ${rubFmt(r.total)}; наш учёт за этот период: ${rubFmt(r.ours)}.`,
      ...r.models.map((m) => `• ${m.model}: ${m.calls} запросов, факт ${rubFmt(m.cost)}${m.ours != null ? `, наш учёт ${rubFmt(m.ours)}` : ""}${m.failed ? `, ошибок ${m.failed}` : ""}`),
      r.priced.length ? `Ставки из логов записаны для моделей без цены: ${r.priced.join(", ")}.` : "Новых ставок не потребовалось: у моделей из логов уже есть цены."].join("\n") };
  } catch (e) { return { error: (e as Error).message }; }
}
