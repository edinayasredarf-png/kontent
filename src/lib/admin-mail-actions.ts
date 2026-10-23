"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./admin";
import { clearMailConfig, mailLayout, saveMailConfig, sendMail } from "./mail";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveMailAction(_: unknown, f: FormData) {
  await requireAdmin();
  const r = await saveMailConfig({ host: s(f, "host"), port: Number(s(f, "port")), secure: f.get("secure") === "on", user: s(f, "user"), pass: String(f.get("pass") ?? ""), from: s(f, "from") });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/admin/mail"); revalidatePath("/app/admin");
  return { ok: "Сохранено. Нажмите «Отправить тестовое письмо», чтобы убедиться, что всё работает" };
}

export async function testMailAction(_: unknown, f: FormData) {
  const c = await requireAdmin();
  const to = s(f, "to") || c.user.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "Укажите корректный email для проверки" };
  try {
    const m = mailLayout("Проверка почты", "Если вы видите это письмо, отправка с платформы настроена правильно.");
    await sendMail({ to, subject: "Проверка почты juicer.ai", text: m.text, html: m.html });
    return { ok: `Письмо отправлено на ${to}. Проверьте входящие и «Спам»` };
  } catch (e) { return { error: `Не удалось отправить: ${(e as Error).message.slice(0, 200)}` }; }
}

export async function clearMailAction() {
  await requireAdmin();
  await clearMailConfig();
  revalidatePath("/app/admin/mail"); revalidatePath("/app/admin");
}
