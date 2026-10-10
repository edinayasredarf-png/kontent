"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "./auth";
import { createKey, revokeKey } from "./apikeys";
import { canManageTeam } from "./team";

type St = { error?: string; ok?: string };

/** Ключ показывается один раз прямо в ответе формы: ни в адресе, ни в базе его открытого вида нет. */
export async function createKeyAction(_: unknown, f: FormData): Promise<St> {
  const c = await requireCtx();
  if (!canManageTeam(c.org.role)) return { error: "Ключи создают владелец и администратор" };
  const r = await createKey(c.org.id, c.user.id, String(f.get("name") ?? ""), f.get("role") === "viewer" ? "viewer" : "editor");
  revalidatePath("/app/developers");
  return r.ok ? { ok: `Ключ создан. Скопируйте его сейчас, потом он не покажется: ${r.key}` } : { error: r.error };
}

export async function revokeKeyAction(f: FormData) {
  const c = await requireCtx();
  if (!canManageTeam(c.org.role)) return;
  await revokeKey(c.org.id, String(f.get("id") ?? ""));
  revalidatePath("/app/developers");
}
