"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireManager } from "./auth";
import { requireAdmin, audit } from "./admin";
import { q } from "./db";
import { createCheckout, syncPayment } from "./payments";
import { PLAN_KEYS, FEATURE_KEYS, planCatalog, validatePlan } from "./plan-catalog";
import type { PlanKey } from "./plans";
import { saveYooConfig, yooConfig, yooRequest } from "./yookassa";
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export async function checkoutAction(f: FormData) {
  const c = await requireManager();
  if (f.get("accept") !== "on") redirect("/app/billing?err="+encodeURIComponent("Подтвердите условия выбранного тарифа"));
  let url: string;
  try { url = (await createCheckout(c.org.id, c.user.id, c.user.email, s(f, "plan"), s(f, "requestKey"))).url; }
  catch (e) { redirect(`/app/billing?err=${encodeURIComponent((e as Error).message)}`); }
  redirect(url!);
}
export async function checkPaymentAction(f: FormData) {
  const c = await requireManager();
  const id = s(f, "order");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  let error = "";
  try { await syncPayment(id, c.org.id); } catch (e) { error = (e as Error).message; }
  revalidatePath("/app", "layout");
  redirect(`/app/billing?order=${id}${error ? `&err=${encodeURIComponent(error)}` : ""}`);
}
export async function savePaymentConfigAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  try {
    await saveYooConfig({ enabled: f.get("enabled") === "on", shopId: s(f, "shopId"), secret: s(f, "secret"), testMode: f.get("testMode") === "on", origin: s(f, "origin"), receipt: f.get("receipt") === "on", vatCode: Number(s(f, "vatCode")), taxSystem: s(f, "taxSystem") ? Number(s(f, "taxSystem")) : null });
    await audit(c.user, "payments.configure", "platform", "yookassa", { shopId: s(f, "shopId"), testMode: f.get("testMode") === "on", enabled: f.get("enabled") === "on" });
    revalidatePath("/app", "layout");
    return { ok: "Настройки сохранены. Проверьте подключение и выполните тестовую оплату." };
  } catch (e) { return { error: (e as Error).message }; }
}
export async function testPaymentConfigAction() {
  await requireAdmin();
  try { const config = await yooConfig(); await yooRequest(config, "payments?limit=1"); return { ok: config.testMode ? "Тестовый магазин доступен. Деньги не списывались." : "Боевой магазин доступен. Деньги не списывались." }; }
  catch (e) { return { error: (e as Error).message }; }
}
export async function savePlanAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  const key = s(f, "key") as PlanKey;
  if (!PLAN_KEYS.includes(key)) return { error: "Неизвестный тариф" };
  try {
    const catalog = await planCatalog();
    const limit = (name: string) => { const v = s(f, name); return v === "" ? null : Number(v); };
    const plan = validatePlan({ key, name: s(f, "name"), priceRub: Number(s(f, "priceRub")), tokens: Number(s(f, "tokens")), durationDays: Number(s(f, "durationDays")), enabled: f.get("enabled") === "on", brands: limit("brands"), factories: limit("factories"), members: limit("members"), sources: limit("sources"), features: s(f, "features").split("\n").map(x => x.trim()).filter(Boolean), unlimitedModels: s(f, "unlimitedModels").split(/[\s,]+/).filter(Boolean), capabilities: FEATURE_KEYS.filter(k => f.get(`cap_${k}`) === "on") }, key);
    // Patch this key atomically so simultaneous edits of two plans cannot overwrite one another.
    await q("insert into kz_platform_settings(key,value) values('billing_plans',$1::jsonb) on conflict(key) do update set value=kz_platform_settings.value || $2::jsonb,updated_at=now()", [JSON.stringify({ ...catalog, [key]: plan }), JSON.stringify({ [key]: plan })]);
    await audit(c.user, "plans.update", "plan", key, { plan });
    revalidatePath("/app", "layout");
    return { ok: "Тариф сохранён. Уже оплаченные условия действуют до конца купленного срока." };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function saveOperatorAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  try {
    const { validateOperator } = await import("./legal");
    const o = validateOperator({ name:s(f,"name"),inn:s(f,"inn"),ogrn:s(f,"ogrn"),address:s(f,"address"),email:s(f,"email"),phone:s(f,"phone"),site:s(f,"site"),bank:s(f,"bank"),account:s(f,"account"),corrAccount:s(f,"corrAccount"),bic:s(f,"bic") });
    await q("insert into kz_platform_settings(key,value) values('legal_operator',$1::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now()", [JSON.stringify(o)]);
    await audit(c.user,"legal.update","platform","operator",{ inn:o.inn });
    revalidatePath("/requisites");revalidatePath("/legal","layout");revalidatePath("/app/admin/billing");
    return { ok:"Реквизиты сохранены на странице и в документах сайта" };
  } catch(e) { return { error:(e as Error).message }; }
}
