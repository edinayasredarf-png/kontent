"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "../auth";
import { one, q } from "../db";
import { aiReady } from "../ai";
import { analyzeBrand, testStyle } from "./analyze";
import { profileFromForm, styleFromForm } from "./edit";
import { isKind, parseLinks, urlToText, type KbKind } from "./ingest";
import { addDoc } from "./docs";
import { InsufficientFunds } from "../wallet";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (brand: string, err?: string, note?: string): never => {
  revalidatePath(`/app/brands/${brand}/knowledge`);
  redirect(`/app/brands/${brand}/knowledge${err ? `?err=${encodeURIComponent(err)}` : note ? `?note=${encodeURIComponent(note)}` : ""}`);
};
async function own(brand: string) { const c = await requireWriter(); if (!(await one("select 1 from kz_brands where id=$1 and org_id=$2", [brand, c.org.id]))) redirect("/app/brands"); return c; }

export async function addTextDocAction(f: FormData) {
  const brand = s(f, "brand"), c = await own(brand);
  const kind = isKind(f.get("kind")) ? (f.get("kind") as KbKind) : "other";
  const r = await addDoc(c.org.id, brand, { kind, title: s(f, "title"), text: String(f.get("text") ?? ""), useStyle: kind === "article" || f.get("style") === "on" });
  back(brand, r.error, r.error ? undefined : "Материал добавлен. Нажмите «Проанализировать», чтобы он попал в базу знаний.");
}

export async function addLinksAction(f: FormData) {
  const brand = s(f, "brand"), c = await own(brand);
  const kind = isKind(f.get("kind")) ? (f.get("kind") as KbKind) : "article";
  const links = parseLinks(String(f.get("links") ?? ""));
  if (!links.length) back(brand, "Вставьте ссылки: по одной в строке, начиная с http");
  let ok = 0; const bad: string[] = [];
  for (const u of links) {
    try {
      const p = await urlToText(u);
      const r = await addDoc(c.org.id, brand, { kind, title: p.title, text: p.text, url: p.url, useStyle: kind === "article" });
      if (r.error) { bad.push(`${u}: ${r.error}`); if (/Лимит/.test(r.error)) break; } else ok++;
    } catch (e) { bad.push(`${u}: ${(e as Error).message}`); }
  }
  back(brand, bad.length ? `${ok ? `Добавлено: ${ok}. ` : ""}Не удалось — ${bad.join("; ").slice(0, 600)}` : undefined, bad.length ? undefined : `Добавлено ссылок: ${ok}. Нажмите «Проанализировать».`);
}

export async function deleteDocAction(f: FormData) {
  const brand = s(f, "brand"), c = await own(brand);
  await q("delete from kz_brand_docs where id=$1 and brand_id=$2 and org_id=$3", [s(f, "id"), brand, c.org.id]);
  back(brand, undefined, "Материал удалён. Профиль обновится при следующем анализе.");
}

export async function toggleStyleAction(f: FormData) {
  const brand = s(f, "brand"), c = await own(brand);
  await q("update kz_brand_docs set use_style = not use_style where id=$1 and brand_id=$2 and org_id=$3", [s(f, "id"), brand, c.org.id]);
  back(brand);
}

export async function analyzeAction(f: FormData) {
  const brand = s(f, "brand"), c = await own(brand);
  if (!aiReady()) back(brand, "AI Gateway не настроен (SELFHOSTED_LLM_URL)");
  let msg = "", err = "";
  try {
    const r = await analyzeBrand(c.org.id, brand, { force: f.get("force") === "on" });
    err = r.error ?? "";
    msg = `Разобрано материалов: ${r.digested}${r.failed ? `, с ошибкой: ${r.failed}` : ""}.${r.style ? " Стиль письма обновлён." : ""}${r.pending ? ` Осталось ещё ${r.pending} — нажмите «Проанализировать» ещё раз.` : " База знаний обновлена."}`;
  } catch (e) { err = e instanceof InsufficientFunds ? "Недостаточно средств на балансе" : (e as Error).message; }
  back(brand, err && !msg ? err : undefined, msg ? msg + (err ? ` Замечание: ${err}` : "") : undefined);
}

export async function saveProfileAction(f: FormData) {
  const brand = s(f, "brand"), c = await own(brand);
  const profile = profileFromForm((k) => String(f.get(k) ?? ""));
  await q(`insert into kz_brand_kb(brand_id,org_id,profile) values($1,$2,$3) on conflict (brand_id) do update set profile=excluded.profile, updated_at=now()`, [brand, c.org.id, JSON.stringify(profile)]);
  back(brand, undefined, "Профиль сохранён");
}

export async function saveStyleAction(f: FormData) {
  const brand = s(f, "brand"), c = await own(brand);
  const style = styleFromForm((k) => String(f.get(k) ?? ""));
  await q(`insert into kz_brand_kb(brand_id,org_id,style) values($1,$2,$3) on conflict (brand_id) do update set style=excluded.style, updated_at=now()`, [brand, c.org.id, JSON.stringify(style)]);
  back(brand, undefined, "Стиль сохранён");
}

export async function testStyleAction(brand: string, topic: string): Promise<{ text?: string; error?: string }> {
  const c = await own(brand);
  const t = topic.trim().slice(0, 300);
  if (t.length < 3) return { error: "Введите тему" };
  if (!aiReady()) return { error: "AI Gateway не настроен (SELFHOSTED_LLM_URL)" };
  try { return { text: await testStyle(c.org.id, brand, t) }; }
  catch (e) { return { error: e instanceof InsufficientFunds ? "Недостаточно средств на балансе" : (e as Error).message }; }
}
