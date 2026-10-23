"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "./auth";
import { one, q } from "./db";
import { cleanKit } from "./images";
import { emailHtml, type EmailMeta } from "./docs";
import { mailConfigured, sendMail } from "./mail";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (fid: string, id: string, msg?: { err?: string; note?: string }) => {
  revalidatePath("/app", "layout");
  redirect(`/app/factories/${fid}?view=list&open=${id}${msg?.err ? `&err=${encodeURIComponent(msg.err)}` : ""}${msg?.note ? `&note=${encodeURIComponent(msg.note)}` : ""}#i-${id}`);
};

export async function saveEmailMetaAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), fid = s(f, "factory");
  const url = s(f, "ctaUrl"), safeUrl = /^https?:\/\/[^\s]+$/i.test(url) ? url : "";
  if (url && !safeUrl) return back(fid, id, { err: "Ссылка кнопки должна начинаться с http:// или https://" });
  const meta = { subject: s(f, "subject").slice(0, 80), preheader: s(f, "preheader").slice(0, 120), headline: s(f, "headline").slice(0, 90), cta: s(f, "cta").slice(0, 40), ctaUrl: safeUrl };
  if (meta.subject.length < 3 || !meta.headline) return back(fid, id, { err: "Нужны тема письма и заголовок" });
  const r = await q("update kz_content_items set meta = meta || jsonb_build_object('email',$3::jsonb), updated_at=now() where id=$1 and org_id=$2 and kind='email' returning id", [id, c.org.id, JSON.stringify(meta)]);
  back(fid, id, r.length ? undefined : { err: "Письмо не найдено" });
}

/** Тестовое письмо на почту того, кто нажал кнопку, через SMTP платформы. Подписчикам ничего не отправляется. */
export async function sendTestEmailAction(f: FormData) {
  const c = await requireWriter();
  const id = s(f, "id"), fid = s(f, "factory");
  if (!(await mailConfigured())) return back(fid, id, { err: "Почта на сервере не настроена (SMTP_HOST, SMTP_USER, SMTP_PASS). Скачайте HTML и отправьте через свой сервис." });
  const it = await one<{ body: string; meta: { email?: EmailMeta }; brand: string; kit: unknown }>(
    "select i.body,i.meta,b.name brand,b.kit from kz_content_items i join kz_brands b on b.id=i.brand_id where i.id=$1 and i.org_id=$2 and i.kind='email'", [id, c.org.id]);
  if (!it?.meta.email) return back(fid, id, { err: "Письмо не найдено" });
  const html = emailHtml(it.meta.email, it.body, { name: it.brand, color: cleanKit(it.kit).colors?.[0]?.hex ?? "#029cda" }).replace("{{unsubscribe_url}}", "#");
  try { await sendMail({ to: c.user.email, subject: `[Тест] ${it.meta.email.subject}`, text: `${it.meta.email.headline}\n\n${it.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`, html }); }
  catch (e) { return back(fid, id, { err: `Не удалось отправить: ${(e as Error).message.slice(0, 160)}` }); }
  back(fid, id, { note: `Тестовое письмо отправлено на ${c.user.email}` });
}
