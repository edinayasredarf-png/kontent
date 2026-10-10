"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { createLink, revokeLink, submitFeedback } from "./share";

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
