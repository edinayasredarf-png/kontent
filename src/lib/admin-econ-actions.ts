"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./admin";
import { deleteModelPrice, resetPrices, saveModelPrice, savePrices, setUnlimitedUntil } from "./admin-econ";
import { DEFAULT_PRICES } from "./wallet";

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
