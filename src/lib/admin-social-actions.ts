"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, audit } from "./admin";
import { one, q } from "./db";
import { open, seal } from "./crypto";
import { APP_DETAILS, APP_FAMILIES, type AppFamily } from "./social-oauth-catalog";
export async function saveSocialAppAction(_: unknown, form: FormData) {
  const actor = await requireAdmin();
  const family = String(form.get("family") || "") as AppFamily;
  if (!APP_FAMILIES.includes(family)) return { error: "Неизвестная площадка" };
  const id = String(form.get("client_id") || "").trim(), inputSecret = String(form.get("client_secret") || "").trim(), applicationKey = String(form.get("application_key") || "").trim();
  if (!/^\d{3,30}$/.test(id)) return { error: "Укажите числовой ID собственного приложения JuicerAI" };
  const saved = await one<{ value: unknown }>("select value from kz_platform_settings where key=$1", [`oauth:${family}`]);
  const previous = saved ? open(saved.value) : null, prefix = APP_DETAILS[family].env;
  const oldId = previous?.id || process.env[`${prefix}_CLIENT_ID`]?.trim();
  const secret = inputSecret || (id === oldId ? previous?.secret || process.env[`${prefix}_CLIENT_SECRET`]?.trim() : "");
  if (!secret) return { error: "Укажите Client Secret. При смене приложения нужен новый секрет." };
  if (family === "ok" && !applicationKey) return { error: "Для Одноклассников нужен публичный ключ приложения (Application Key)" };
  if (secret.length > 4096 || applicationKey.length > 256) return { error: "Параметры приложения слишком длинные" };
  await q("insert into kz_platform_settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value,updated_at=now()", [`oauth:${family}`, JSON.stringify(seal({ id, secret, applicationKey }))]);
  await audit(actor.user, "social_app_saved", "platform_settings", family, { clientIdChanged: oldId !== id });
  revalidatePath("/app", "layout");
  return { ok: "Параметры сохранены. Включите нужные права в кабинете площадки и проверьте подключение своего аккаунта. Сохранение не заменяет одобрение приложения." };
}
