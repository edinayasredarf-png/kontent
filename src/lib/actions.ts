"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canWrite, login, logout, register, requireCtx, switchOrg, type Ctx } from "./auth";
import { one, q } from "./db";
import { PLANS } from "./plans";
import { PRICES, charge, refund, InsufficientFunds } from "./wallet";
import { aiReady, genPlan, genPost, type BrandCtx } from "./ai";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function writer(): Promise<Ctx> {
  const c = await requireCtx();
  if (!canWrite(c.org.role)) throw new Error("Недостаточно прав");
  return c;
}

// ---------- auth ----------
export async function loginAction(_: unknown, f: FormData) {
  const r = await login(s(f, "email"), s(f, "password"));
  if (r.error) return r;
  redirect("/app");
}
export async function registerAction(_: unknown, f: FormData) {
  const r = await register(s(f, "email"), s(f, "password"), s(f, "name"), s(f, "org"));
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
    await q("update brands set name=$3,description=$4,audience=$5,tone=$6,rules=$7 where id=$1 and org_id=$2",
      [id, c.org.id, s(f, "name"), s(f, "description"), s(f, "audience"), s(f, "tone") || "professional", rules]);
  } else {
    const lim = PLANS[c.org.plan].brands;
    const n = Number((await one<{ n: string }>("select count(*) n from brands where org_id=$1", [c.org.id]))!.n);
    if (lim !== null && n >= lim) return { error: `Тариф «${PLANS[c.org.plan].name}»: максимум брендов — ${lim}. Повысьте тариф.` };
    await q("insert into brands(org_id,name,description,audience,tone,rules) values($1,$2,$3,$4,$5,$6)",
      [c.org.id, s(f, "name"), s(f, "description"), s(f, "audience"), s(f, "tone") || "professional", rules]);
  }
  revalidatePath("/app/brands");
  redirect("/app/brands");
}

// ---------- factories ----------
export async function saveFactory(_: unknown, f: FormData) {
  const c = await writer();
  const brand = await one("select 1 from brands where id=$1 and org_id=$2", [s(f, "brand_id"), c.org.id]);
  if (!brand) return { error: "Выберите бренд" };
  if (!s(f, "name")) return { error: "Укажите название завода" };
  const lim = PLANS[c.org.plan].factories;
  const n = Number((await one<{ n: string }>("select count(*) n from factories where org_id=$1", [c.org.id]))!.n);
  if (lim !== null && n >= lim) return { error: `Тариф «${PLANS[c.org.plan].name}»: максимум заводов — ${lim}. Повысьте тариф.` };
  const formats = f.getAll("formats").map(String).filter(Boolean);
  const days = f.getAll("days").map(Number);
  const times = s(f, "times").split(",").map((x) => x.trim()).filter((x) => /^\d{2}:\d{2}$/.test(x));
  const schedule = JSON.stringify({ days: days.length ? days : [1, 2, 3, 4, 5], times: times.length ? times : ["10:00"], tz: "Europe/Moscow" });
  const row = await one<{ id: string }>(
    `insert into factories(org_id,brand_id,name,niche,product,formats,schedule,approval,autopublish)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [c.org.id, s(f, "brand_id"), s(f, "name"), s(f, "niche"), s(f, "product"), formats.length ? formats : ["post"], schedule,
     s(f, "approval") === "auto" ? "auto" : "manual", f.get("autopublish") === "on"]);
  revalidatePath("/app/factories");
  redirect(`/app/factories/${row!.id}`);
}

export async function toggleFactory(f: FormData) {
  const c = await writer();
  await q("update factories set status=case when status='active' then 'paused' else 'active' end where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  revalidatePath(`/app/factories/${s(f, "id")}`);
}

export async function deleteFactory(f: FormData) {
  const c = await writer();
  await q("delete from factories where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
  redirect("/app/factories");
}

async function factoryCtx(orgId: string, id: string) {
  return one<{ id: string; brand_id: string; niche: string; product: string; formats: string[]; name: string; description: string; audience: string; tone: string; rules: { forbidden?: string[] } }>(
    `select f.id,f.brand_id,f.niche,f.product,f.formats,f.name,b.description,b.audience,b.tone,b.rules,b.name brand_name
       from factories f join brands b on b.id=f.brand_id where f.id=$1 and f.org_id=$2`, [id, orgId]);
}
const brandOf = (r: NonNullable<Awaited<ReturnType<typeof factoryCtx>>> & { brand_name?: string }): BrandCtx =>
  ({ name: r.brand_name ?? r.name, description: r.description, audience: r.audience, tone: r.tone, forbidden: r.rules?.forbidden ?? [] });

export async function generatePlanAction(f: FormData) {
  const c = await writer();
  const id = s(f, "id");
  const days = Math.min(30, Math.max(1, Number(s(f, "days")) || 7));
  const fac = await factoryCtx(c.org.id, id);
  if (!fac) return;
  if (!aiReady()) redirect(`/app/factories/${id}?err=${encodeURIComponent("Не задан ANTHROPIC_API_KEY")}`);
  const cost = PRICES.plan_day * days;
  try { await charge(c.org.id, cost, `Контент-план на ${days} дн.`, id); }
  catch (e) { if (e instanceof InsufficientFunds) redirect(`/app/factories/${id}?err=${encodeURIComponent("Недостаточно средств на балансе")}`); throw e; }
  try {
    const used = (await q<{ topic: string }>("select topic from content_items where factory_id=$1 order by created_at desc limit 60", [id])).map((x) => x.topic);
    const ideas = await genPlan(brandOf(fac), fac.product, fac.niche, fac.formats, days, used);
    const start = new Date(); start.setDate(start.getDate() + 1);
    for (let i = 0; i < ideas.length; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      await q(`insert into content_items(org_id,factory_id,brand_id,kind,topic,hook,planned_for) values($1,$2,$3,$4,$5,$6,$7)`,
        [c.org.id, id, fac.brand_id, ideas[i].kind, ideas[i].topic, ideas[i].hook, d.toISOString().slice(0, 10)]);
    }
  } catch (e) {
    await refund(c.org.id, cost, "ошибка генерации плана", id);
    redirect(`/app/factories/${id}?err=${encodeURIComponent("Генерация не удалась, деньги возвращены")}`);
  }
  revalidatePath(`/app/factories/${id}`);
  redirect(`/app/factories/${id}`);
}

export async function setItemStatus(f: FormData) {
  const c = await writer();
  const st = s(f, "status");
  if (!["approved", "rejected", "idea"].includes(st)) return;
  await q("update content_items set status=$3 where id=$1 and org_id=$2", [s(f, "id"), c.org.id, st]);
  revalidatePath("/app", "layout");
}

export async function generateItemAction(f: FormData) {
  const c = await writer();
  const item = await one<{ id: string; factory_id: string; kind: string; topic: string; hook: string }>(
    "select id,factory_id,kind,topic,hook from content_items where id=$1 and org_id=$2 and status in ('idea','approved','failed')", [s(f, "id"), c.org.id]);
  if (!item || !aiReady()) return;
  const fac = await factoryCtx(c.org.id, item.factory_id);
  if (!fac) return;
  const cost = item.kind === "carousel" ? PRICES.carousel_slide * 6 : item.kind === "article" ? PRICES.article : item.kind === "reels" ? PRICES.reels : PRICES.post;
  try { await charge(c.org.id, cost, `Генерация: ${item.topic.slice(0, 60)}`, item.id); }
  catch (e) { if (e instanceof InsufficientFunds) return; throw e; }
  await q("update content_items set status='generating' where id=$1", [item.id]);
  try {
    const body = await genPost(brandOf(fac), fac.product, fac.niche, item.topic, item.hook, item.kind);
    await q("update content_items set body=$2,status='ready',cost_kop=$3 where id=$1", [item.id, body, cost]);
  } catch {
    await refund(c.org.id, cost, "ошибка генерации текста", item.id);
    await q("update content_items set status='failed' where id=$1", [item.id]);
  }
  revalidatePath("/app", "layout");
}

export async function saveBody(f: FormData) {
  const c = await writer();
  await q("update content_items set body=$3 where id=$1 and org_id=$2", [s(f, "id"), c.org.id, s(f, "body")]);
  revalidatePath("/app", "layout");
}

// ---------- channels ----------
export async function saveChannel(_: unknown, f: FormData) {
  const c = await writer();
  if (!(await one("select 1 from brands where id=$1 and org_id=$2", [s(f, "brand_id"), c.org.id]))) return { error: "Выберите бренд" };
  const kind = s(f, "kind");
  const creds = JSON.stringify({ token: s(f, "token"), target: s(f, "target") });
  await q("insert into channels(org_id,brand_id,kind,title,credentials) values($1,$2,$3,$4,$5)", [c.org.id, s(f, "brand_id"), kind, s(f, "title") || kind, creds]);
  revalidatePath("/app/channels");
  redirect("/app/channels");
}
export async function deleteChannel(f: FormData) {
  const c = await writer();
  await q("delete from channels where id=$1 and org_id=$2", [s(f, "id"), c.org.id]);
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
  await q("update orgs set plan=$2 where id=$1", [c.org.id, p]);
  revalidatePath("/app", "layout");
}
