"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { diagnose } from "./errors";
import { canWrite, login, logout, register, requireCtx, switchOrg, type Ctx } from "./auth";
import { one, q } from "./db";
import { PLANS } from "./plans";
import { AI_TASKS, saveRoute, type AiTask } from "./ai";
import { buildImage, buildItem, buildPlan, enqueue, processQueue } from "./pipeline";
import { cleanKit, describeImage } from "./images";
import { loadAsset } from "./assets";
import { seal } from "./crypto";
import { providerFor } from "./publishing";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function writer(): Promise<Ctx> {
  const c = await requireCtx();
  if (!canWrite(c.org.role)) throw new Error("Недостаточно прав");
  return c;
}

// ---------- auth ----------
// redirect() в Next — это исключение, поэтому ловим только ошибки до него
export async function loginAction(_: unknown, f: FormData) {
  let r: { error?: string };
  try { r = await login(s(f, "email"), s(f, "password")); }
  catch (e) { console.error("[login]", e); return { error: diagnose(e) }; }
  if (r.error) return r;
  redirect("/app");
}
export async function registerAction(_: unknown, f: FormData) {
  let r: { error?: string };
  try { r = await register(s(f, "email"), s(f, "password"), s(f, "name"), s(f, "org")); }
  catch (e) { console.error("[register]", e); return { error: diagnose(e) }; }
  if (r.error) return r;
  redirect("/app");
}
export async function logoutAction() { await logout(); redirect("/login"); }
export async function switchOrgAction(f: FormData) { await switchOrg(s(f, "org")); redirect("/app"); }

// ---------- brands ----------
export async function saveBrand(_: unknown, f: FormData) {
  const c = await writer();
  const id = s(f, "id");
  const list = (k: string) => s(f, k).split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const rules = JSON.stringify({ forbidden: list("forbidden"), competitors: list("competitors") });
  if (!s(f, "name")) return { error: "Укажите название" };
  if (id) {
    // 6 слотов цвета; включённые отмечены флажком (у <input type=color> «пустого» значения нет)
    const colors = [0, 1, 2, 3, 4, 5].filter((i) => f.get(`color_on_${i}`) === "on").map((i) => ({ hex: s(f, `color_hex_${i}`), name: s(f, `color_name_${i}`) }));
    const kit = f.has("kit_present") ? JSON.stringify(cleanKit({
      colors,
      fonts: s(f, "fonts"), style: s(f, "style"), styleNotes: s(f, "styleNotes"), imageMust: s(f, "imageMust"), imageNever: s(f, "imageNever"),
      aspect: s(f, "aspect"), logoPos: s(f, "logoPos"), logoScale: Number(s(f, "logoScale")),
    })) : null;
    await q("update kz_brands set name=$3,description=$4,audience=$5,tone=$6,rules=$7,kit=coalesce($8::jsonb,kit) where id=$1 and org_id=$2",
      [id, c.org.id, s(f, "name"), s(f, "description"), s(f, "audience"), s(f, "tone") || "professional", rules, kit]);
    revalidatePath(`/app/brands/${id}`);
    return { ok: "Сохранено" };
  } else {
    const lim = c.org.unlimited ? null : PLANS[c.org.plan].brands;
    const n = Number((await one<{ n: string }>("select count(*) n from kz_brands where org_id=$1", [c.org.id]))!.n);
    if (lim !== null && n >= lim) return { error: `Тариф «${PLANS[c.org.plan].name}»: максимум брендов — ${lim}. Повысьте тариф.` };
    await q("insert into kz_brands(org_id,name,description,audience,tone,rules) values($1,$2,$3,$4,$5,$6)",
      [c.org.id, s(f, "name"), s(f, "description"), s(f, "audience"), s(f, "tone") || "professional", rules]);
  }
  revalidatePath("/app/brands");
  redirect("/app/brands");
}

// ---------- brand assets & images ----------
export async function deleteAssetAction(f: FormData) {
  const c = await writer();
  const a = await one<{ brand_id: string }>("delete from kz_assets where id=$1 and org_id=$2 and kind<>'generated' returning brand_id", [s(f, "id"), c.org.id]);
  if (a) revalidatePath(`/app/brands/${a.brand_id}`);
}

export async function redescribeAssetAction(f: FormData) {
  const c = await writer();
  const a = await loadAsset(c.org.id, s(f, "id"));
  if (!a || (a.kind !== "reference" && a.kind !== "product")) return;
  try { await q("update kz_assets set note=$2 where id=$1", [a.id, await describeImage({ data: a.data, mime: a.mime }, a.kind)]); } catch { /* останется без описания, пользователь увидит кнопку снова */ }
  revalidatePath("/app/brands", "layout");
}

export async function generateImageAction(f: FormData) {
  const c = await writer();
  const fid = s(f, "factory");
  const r = await buildImage(c.org.id, s(f, "id"), s(f, "prompt"));
  revalidatePath("/app", "layout");
  if (!r.ok) redirect(`/app/factories/${fid}?err=${encodeURIComponent(r.error)}`);
}

export async function removeImageAction(f: FormData) {
  const c = await writer();
  const it = await one<{ image_id: string | null }>("update kz_content_items set image_id=null where id=$1 and org_id=$2 returning (select image_id from kz_content_items where id=$1) image_id", [s(f, "id"), c.org.id]);
  if (it?.image_id) await q("delete from kz_assets where id=$1 and org_id=$2", [it.image_id, c.org.id]);
  revalidatePath("/app", "layout");
}

// ---------- factories ----------
export async function saveFactory(_: unknown, f: FormData) {
  const c = await writer();
  const brand = await one("select 1 from kz_brands where id=$1 and org_id=$2", [s(f, "brand_id"), c.org.id]);
  if (!brand) return { error: "Выберите бренд" };
  if (!s(f, "name")) return { error: "Укажите название завода" };
  const lim = c.org.unlimited ? null : PLANS[c.org.plan].factories;
  const n = Number((await one<{ n: string }>("select count(*) n from kz_factories where org_id=$1", [c.org.id]))!.n);
  if (lim !== null && n >= lim) return { error: `Тариф «${PLANS[c.org.plan].name}»: максимум заводов — ${lim}. Повысьте тариф.` };
  const formats = f.getAll("formats").map(String).filter(Boolean);
  const days = f.getAll("days").map(Number);
  const times = s(f, "times").split(",").map((x) => x.trim()).filter((x) => /^\d{2}:\d{2}$/.test(x));
  const schedule = JSON.stringify({ days: days.length ? days : [1, 2, 3, 4, 5], times: times.length ? times : ["10:00"], tz: "Europe/Moscow" });
  const row = await one<{ id: string }>(
    `insert into kz_factories(org_id,brand_id,name,niche,product,formats,schedule,approval,autopublish)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [c.org.id, s(f, "brand_id"), s(f, "name"), s(f, "niche"), s(f, "product"), formats.length ? formats : ["post"], schedule,
     s(f, "approval") === "auto" ? "auto" : "manual", f.get("autopublish") === "on"]);
  revalidatePath("/app/factories");
  redirect(`/app/factories/${row!.id}`);
}

export async function toggleFactory(f: FormData) {
  const c = await writer();
  await q("update kz_factories set status=case when status='active' then 'paused' else 'active' end where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  revalidatePath(`/app/factories/${s(f, "id")}`);
}

export async function deleteFactory(f: FormData) {
  const c = await writer();
  await q("delete from kz_factories where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  redirect("/app/factories");
}

export async function generatePlanAction(f: FormData) {
  const c = await writer();
  const id = s(f, "id");
  const r = await buildPlan(c.org.id, id, Math.min(30, Math.max(1, Number(s(f, "days")) || 7)));
  revalidatePath(`/app/factories/${id}`);
  redirect(`/app/factories/${id}${r.ok ? "" : `?err=${encodeURIComponent(r.error)}`}`);
}

export async function setItemStatus(f: FormData) {
  const c = await writer();
  const st = s(f, "status");
  if (!["approved", "rejected", "idea"].includes(st)) return;
  await q("update kz_content_items set status=$3 where id=$1 and org_id=$2", [s(f, "id"), c.org.id, st]);
  revalidatePath("/app", "layout");
}

export async function generateItemAction(f: FormData) {
  const c = await writer();
  const r = await buildItem(c.org.id, s(f, "id"));
  const fid = s(f, "factory");
  revalidatePath("/app", "layout");
  if (!r.ok) redirect(`/app/factories/${fid}?err=${encodeURIComponent(r.error)}`);
}

export async function publishNowAction(f: FormData) {
  const c = await writer();
  const id = s(f, "id"), fid = s(f, "factory");
  const e = await enqueue(c.org.id, id);
  if (e.ok) await processQueue(10, id);
  revalidatePath("/app", "layout");
  if (!e.ok) redirect(`/app/factories/${fid}?err=${encodeURIComponent(e.error)}`);
}

export async function setFactoryChannels(f: FormData) {
  const c = await writer();
  const id = s(f, "id");
  // принимаем только каналы того же бренда и той же организации
  const ids = await q<{ id: string }>(
    `select ch.id from kz_channels ch join kz_factories fa on fa.brand_id=ch.brand_id
      where fa.id=$1 and fa.org_id=$2 and ch.org_id=$2 and ch.id = any($3::uuid[])`, [id, c.org.id, f.getAll("channels").map(String)]);
  await q("update kz_factories set channel_ids=$3, autopublish=$4, approval=$5, brief = brief || jsonb_build_object('images', $6::boolean) where id=$1 and org_id=$2",
    [id, c.org.id, ids.map((x) => x.id), f.get("autopublish") === "on", s(f, "approval") === "auto" ? "auto" : "manual", f.get("images") === "on"]);
  revalidatePath(`/app/factories/${id}`);
}

export async function saveAiRoutes(f: FormData) {
  const c = await requireCtx();
  if (!c.isAdmin) return;
  for (const k of ["default", ...AI_TASKS.map((t) => t.key)] as (AiTask | "default")[]) {
    const m = s(f, `route_${k}`);
    if (m.length > 200 || /\s/.test(m)) continue; // id модели — одна строка без пробелов
    await saveRoute(k, m);
  }
  revalidatePath("/app/settings");
}

export async function saveBody(f: FormData) {
  const c = await writer();
  await q("update kz_content_items set body=$3 where id=$1 and org_id=$2", [s(f, "id"), c.org.id, s(f, "body")]);
  revalidatePath("/app", "layout");
}

// ---------- channels ----------
export async function saveChannel(_: unknown, f: FormData) {
  const c = await writer();
  if (!(await one("select 1 from kz_brands where id=$1 and org_id=$2", [s(f, "brand_id"), c.org.id]))) return { error: "Выберите бренд" };
  const kind = s(f, "kind");
  const prov = providerFor(kind);
  if (!prov) return { error: "Этот тип канала пока не поддерживается" };
  const cred = { token: s(f, "token"), target: s(f, "target") };
  // Проверяем до сохранения: токен рабочий, бот — админ, сообщество существует.
  let name: string;
  try { name = await prov.verify(cred); } catch (e) { return { error: (e as Error).message }; }
  await q("insert into kz_channels(org_id,brand_id,kind,title,credentials) values($1,$2,$3,$4,$5)", [c.org.id, s(f, "brand_id"), kind, s(f, "title") || name, JSON.stringify(seal(cred))]);
  revalidatePath("/app/channels");
  redirect("/app/channels");
}
export async function deleteChannel(f: FormData) {
  const c = await writer();
  await q("delete from kz_channels where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  revalidatePath("/app/channels");
}

// ---------- billing ----------
export async function setPlan(f: FormData) {
  const c = await requireCtx();
  if (c.org.role !== "owner") return;
  const p = s(f, "plan");
  if (!(p in PLANS)) return;
  // Платёжного шлюза ещё нет: без флага смена тарифа закрыта, иначе любой владелец взял бы «Агентство» бесплатно.
  if (process.env.ALLOW_FREE_PLAN_SWITCH !== "1") return;
  await q("update kz_orgs set plan=$2 where id=$1", [c.org.id, p]);
  revalidatePath("/app", "layout");
}
