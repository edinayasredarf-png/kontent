"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { createLink, revokeLink, submitFeedback } from "./share";
import { q } from "./db";
import { canManageTeam } from "./team";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Публичная форма клиента: без входа, проверка ссылки внутри submitFeedback. */
export async function feedbackAction(f: FormData) {
  const token = s(f, "token");
  const r = await submitFeedback(token, s(f, "item"), s(f, "verdict"), s(f, "author"), String(f.get("comment") ?? ""));
  revalidatePath(`/share/${token}`);
  redirect(`/share/${token}?${r.ok ? "done=1" : `err=${encodeURIComponent(r.error)}`}#i-${s(f, "item")}`);
}

export async function createShareLinkAction(f: FormData) {
  const c = await requireWriter();
  const brand = s(f, "brand");
  const r = await createLink(c.org.id, brand, {
    label: s(f, "label"), canApprove: f.get("approve") === "on", showReport: f.get("report") === "on", autoPublish: f.get("auto") === "on", days: Math.max(0, Math.min(365, Number(s(f, "days")) || 0)),
  });
  revalidatePath(`/app/brands/${brand}`);
  redirect(`/app/brands/${brand}${r.ok ? "" : `?err=${encodeURIComponent(r.error)}`}`);
}

export async function revokeShareLinkAction(f: FormData) {
  const c = await requireWriter();
  await revokeLink(c.org.id, s(f, "id"));
  revalidatePath(`/app/brands/${s(f, "brand")}`);
  redirect(`/app/brands/${s(f, "brand")}`);
}

/** Белая метка организации: имя агентства, подпись и скрытие упоминания платформы на клиентских страницах. */
export async function saveWhiteLabelAction(f: FormData) {
  const c = await requireWriter();
  if (!canManageTeam(c.org.role)) redirect(`/app/brands/${s(f, "brand")}?err=${encodeURIComponent("Оформление портала меняют владелец и администратор")}`);
  await q("update kz_orgs set wl_name=$2, wl_footer=$3, wl_hide=$4 where id=$1", [c.org.id, s(f, "name").slice(0, 80), String(f.get("footer") ?? "").replace(/\r/g, "").trim().slice(0, 400), f.get("hide") === "on"]);
  revalidatePath(`/app/brands/${s(f, "brand")}`);
  redirect(`/app/brands/${s(f, "brand")}`);
}
