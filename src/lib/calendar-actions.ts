"use server";

import {planBases} from "./plan-bases";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { addIdeas } from "./plan";
import { buildPlan } from "./pipeline";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function finish(form: FormData, result: { ok: boolean; error?: string }) {
  revalidatePath("/app", "layout");
  // Only carry calendar filters back; never accept a redirect destination from the client.
  const params = new URLSearchParams();
  for (const key of ["m", "date", "period", "view", "factory", "kind", "status"]) {
    const v = value(form, `return_${key}`);
    if (v) params.set(key, v);
  }
  if (!result.ok) params.set("err", result.error ?? "Не удалось сохранить изменения");
  const factory = value(form, "factory");
  if (value(form, "return_to_factory") === "yes" && /^[0-9a-f-]{36}$/i.test(factory)) {
    params.set("tab", "plan");
    params.delete("factory");
    redirect(`/app/factories/${factory}?${params}`);
  }
  redirect(`/app/calendar?${params}`);
}

export async function addCalendarIdea(form: FormData) {
  const c = await requireWriter();
  const result = await addIdeas(c.org.id, value(form, "factory"), [{ topic: value(form, "topic"), hook: value(form, "hook") }], value(form, "kind"), form.get("approve") === "on", value(form, "date") || undefined);
  finish(form, result);
}

export async function extendCalendarPlan(form: FormData) {
  const c = await requireWriter();
  const days = Number(value(form, "days"));
  if (![7, 14, 30].includes(days)) finish(form, { ok: false, error: "Выберите 7, 14 или 30 дней" });
  let bases; try {bases=planBases(form.get("bases_present")?form.getAll("bases"):undefined);}catch(e){finish(form,{ok:false,error:(e as Error).message});}
  const result = await buildPlan(c.org.id, value(form, "factory"), days,bases);
  finish(form, result);
}
